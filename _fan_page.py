import datetime

from flask import abort
from flask import redirect
from flask import url_for
from sqlalchemy import select

import config
import db
import feature_flags as feature
import services.external_url
import services.fan_page
import services.fan_page_modules
import services.feature_fm
import services.settings
import util.strings
from appserv.base import BaseView
from appserv.deco import modern_browser_ua_required
from appserv.deco import route
from appserv.mixins import DistroMixin
from appserv.utils import ctx_db_readwrite
from appserv.utils import get_logged_in_user
from feature_flags import Feature
from services import corpus
from services.analytics import exec_row_query
from services.distro import delivery
from services.fuga import FugaReleaseFormat
from services.fuga import get_fuga_release_format
from services.insights.etl.schemas.datawarehouse import DimTrack

# TODO aston (04/03/2019): remove this hack once we convert these releases to videos
HACK_VIDEO_RELEASE_IDS = {
    'AtRQTic4EEXE',
    'ASACjR2iM3cf',
    'AKa9LAidB4Xn',
    'AU9ZnP6Q5vDx',
    'AYcaW2bLziSQ',
}

class FanPageView(BaseView, DistroMixin):
    # Do not add non-catchall routes here. If new fan page endpoints need to be made, put them in
    # views/fan_page.py (no underscore). When registering views, any files starting with an underscore
    # will be ignored. We want to ignore this view until all the others have been registered. Then, we
    # register it last with register_special()
    route_base = '/'

    def get_og_tags(self, title, fan_page, modules = []):
        bio = next((x for x in modules if x.get('type') == 'bio'), None)
        description = bio.get('description_text') if bio else fan_page.message
        return {
            'og:title': title,
            'og:url': fan_page.url,
            'og:description': description,
            'og:image': fan_page.artist_image_url,

            'twitter:card': 'summary',
            'twitter:title': title,
            'twitter:url': fan_page.url,
            'twitter:description': description,
            'twitter:image': fan_page.artist_image_url,
        }

    @modern_browser_ua_required
    @route('<fan_page_handle>')
    def fan_page(self, fan_page_handle):
        logged_in_user = get_logged_in_user()
        is_authenticated = logged_in_user and logged_in_user.is_authenticated
        logged_in_artist = is_authenticated and corpus.find_one_linked(logged_in_user.id, corpus.Artist)

        artist_fan_page = services.fan_page.get_artist_fan_page(fan_page_handle)
        if not artist_fan_page:
            return abort(404)

        artist, fan_page = artist_fan_page
        title = u'{} | Official Website, Listen, Merch, Tours'.format(artist.profile.get('name', ''))

        if not fan_page.data.get('module_order'):
            with ctx_db_readwrite():
                music_module = services.fan_page_modules.create_module(artist.id, 'music')
                module_order = [music_module['id']]
                conn = db.get_connection()
                conn.t3.artist_fan_page.update_one(
                    {'url_handle': fan_page_handle},
                    {'$set': {'module_order': module_order}}
                )
        else:
            module_order = fan_page.data.get('module_order')

        release_info_map = {}
        releases = corpus.find_linked(artist, corpus.Release)
        releases = [r for r in releases if r.id not in HACK_VIDEO_RELEASE_IDS]
        releases.sort(key=lambda r: r.release_date or datetime.datetime.min, reverse=True)

        corpus.populate_one(releases, cover_art=corpus.Asset)
        corpus.populate(releases, tracks=corpus.Track)
        for release in releases:
            if release['fuga_delivery_date'] and not release['fuga_takedown_date']:
                masterlink = services.feature_fm.get_smartlink(release)
                fuga_release_format = get_fuga_release_format(release.tracks)
                format_to_str = {
                    FugaReleaseFormat.Single: 'Single',
                    FugaReleaseFormat.EP: 'EP',
                    FugaReleaseFormat.Album: 'Album',
                }
                release_info_map[release.id] = {
                    'release_format': format_to_str[fuga_release_format],
                    'masterlink': masterlink,
                }

        component = 'ArtistPageApp'
        modules = services.fan_page_modules.get_sorted_modules_by_id(artist, module_order)

        return self.render_react(
            analytics_key=config.um_analytics_key,
            title=title,
            component=component,
            props={
                'artist': artist,
                'artistImgAssetId': fan_page.artist_image_id,
                'fanPage': fan_page.data,
                'loggedInArtist': logged_in_artist,
                'releases': releases,
                'releaseInfo': release_info_map,
                'socialSummary': services.artist.fetch_platform_summaries(artist),
                'modules': modules,
            },
            responsive=True,
            og_tags=self.get_og_tags(title, fan_page, modules),
        )

    @route('<fan_page_handle>/s/<sweeps_name>')
    def fan_page_winner(self, fan_page_handle, sweeps_name):
        artist_fan_page = services.fan_page.get_artist_fan_page(fan_page_handle)
        if not artist_fan_page:
            return abort(404)

        artist, fan_page = artist_fan_page

        return self.render_react(
            analytics_key=config.um_analytics_key,
            title='Results',
            component='FanPageWinnerApp',
            props={
                'artist': artist,
                'artistImgAssetId': fan_page.artist_image_id,
                'fanPage': fan_page.data,
                'sweepsName': sweeps_name,
            },
            responsive=True,
        )

    @route('<fan_page_handle>/t/<terms_name>')
    def fan_page_terms(self, fan_page_handle, terms_name):
        artist_fan_page = services.fan_page.get_artist_fan_page(fan_page_handle)
        if not artist_fan_page:
            return abort(404)

        artist, fan_page = artist_fan_page

        return self.render_react(
            analytics_key=config.um_analytics_key,
            title='Terms and Conditions',
            component='FanPageTermsApp',
            props={
                'artist': artist,
                'artistImgAssetId': fan_page.artist_image_id,
                'fanPage': fan_page.data,
                'termsName': terms_name,
            },
            responsive=True,
        )

    @modern_browser_ua_required
    @route('/<fan_page_handle>/r/<release_id>')
    @route('/<fan_page_handle>/r/<release_handle>/<release_id>', endpoint='canonical-release-fan-page')
    @feature.is_active_feature(Feature.FanReleasePageEnabled)
    def release_fan_page(self, fan_page_handle, release_id, release_handle=None):
        artist_fan_page = services.fan_page.get_artist_fan_page(fan_page_handle)
        if not artist_fan_page:
            return abort(404)
        artist, fan_page = artist_fan_page

        logged_in_user = get_logged_in_user()
        is_authenticated = logged_in_user and logged_in_user.is_authenticated
        logged_in_artist = is_authenticated and corpus.find_one_linked(logged_in_user.id, corpus.Artist)

        release = self.get_release(release_id, for_artist=artist)
        release_external_urls = services.external_url.get_external_urls(release) or {}
        corpus.populate_one(release, cover_art=corpus.Asset)

        if not release:
            return abort(404)

        if not release.title:
            return abort(404)

        if not release.fuga_delivery_date:
            return abort(404)

        if release.fuga_takedown_date:
            return abort(404)

        tracks = corpus.find_linked(release.id, corpus.Track)
        corpus.populate(tracks, assets=corpus.Asset)

        # DC - 07/12/2019 Making sure the preview tracks url already exist
        # before rendering the page.
        for track in tracks:
            delivery.get_preview_track_url(track.assets[0].id, True)

        current_release_handle = util.strings.slugify(release.title)
        if release_handle != current_release_handle:
            return redirect(
                url_for(
                    'canonical-release-fan-page',
                    fan_page_handle=fan_page_handle,
                    release_id=release_id,
                    release_handle=current_release_handle,
                )
            )

        title = u'{} - {}'.format(artist.profile.get('name'), release.title)

        og_tags = self.get_og_tags(title, fan_page)
        description = 'Get early access to new music, merch, tickets, and more. Login with Spotify to join me.'
        og_tags['og:description'] = description
        og_tags['twitter:description'] = description

        query = (
            select([DimTrack.apple_track_id])
            .select_from(DimTrack)
            .where(DimTrack.upc == release.upc)
        )

        # TODO: Grant 6/3/19 - We should have validation in here in case
        # this query returns null.
        apple_id = exec_row_query(query) or {}
        # Null make presave

        return self.render_react(
            analytics_key=config.um_analytics_key,
            title=title,
            component='FanPageReleaseApp',
            props={
                'artist': artist,
                'artistImgAssetId': fan_page.artist_image_id,
                'fanPage': fan_page.data,
                'loggedInArtist': logged_in_artist,
                'release': release,
                'releaseExternalURLs': release_external_urls,
                'releaseIsLive': release.is_release_live,
                'tracks': tracks,
                'appleTrackId': apple_id.get('apple_track_id') or '',
            },
            responsive=True,
            og_tags=og_tags,
        )
