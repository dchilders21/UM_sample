/* @flow */
/* eslint-disable max-len */

import * as React from 'react';
import autobind from 'autobind-decorator';
import classNames from 'classnames';

import UnthemedSpinnableImage from 'lib/components/asset-management/UnthemedSpinnableImage';
import IconPlayArrow from 'lib/components/svg/IconPlayArrow';
import IconPause from 'lib/components/svg/IconPause';
import IconSpotify from 'lib/components/svg/IconSpotify';
import IconApple from 'lib/components/svg/IconApple';
import IconSoundcloud from 'lib/components/svg/IconSoundcloud';
import IconYoutube from 'lib/components/svg/IconYoutube';
import IconAppleMusic from 'lib/components/svg/IconAppleMusic';
import IconTidal from 'lib/components/svg/IconTidal';
import IconGooglePlay from 'lib/components/svg/IconGooglePlay';
import IconAmazon from 'lib/components/svg/IconAmazon';
import IconUMLogo from 'lib/components/svg/IconUMLogo';
import FanPageReleaseSettings from './FanPageReleaseSettings';
import ArtistPageMessages from './components/ArtistPageMessages';
import type {FanPageSubmission} from 'lib/types/FanPage';
import type {Artist} from 'lib/artists';
import type {Release} from 'lib/types/Release';
import {getAssetThumbnailURLForID, getTrackPreviewUrl} from 'lib/AssetUtils';
import IconEdit from 'lib/components/svg/IconEdit';
import moment from 'moment';
import {ColorExtractor} from 'react-color-extractor';
import AudioVisualizer from './components/AudioVisualizer';
import fanPageAnalytics from './util/FanPageAnalytics';
import {contactMessages} from 'lib/fanPageDefaults';

import {postJSON, ServerError} from 'lib/fetchJSON';
import SpotifyAuthManager from 'lib/SpotifyAuthManager';
import {MOBILE_MAX_WIDTH} from 'lib/layout';

import styles from './FanPageReleaseApp.css';

import AppleMusicAuth from 'lib/components/auth/AppleMusicAuth';
import OffCanvasPanelOverlay from './components/OffCanvasPanelOverlay';

type Props = {
  appleTrackId: ?string,
  artist: Artist,
  artistImgAssetId: ?string,
  fanPage: {
    background_asset_id: ?string,
    connect_text: ?string,
    thank_you_text: ?string,
    url_handle: string,
  },
  release: Release,
  releaseIsLive: ?boolean,
  tracks: Array<Object>,
  loggedInArtist: Artist,
  releaseExternalURLs: Object,
}

type State = {
  amUserToken: ?string,
  artistImgAssetId: string,
  prefillData: ?FanPageSubmission,
  submittedData: ?FanPageSubmission,
  error: ?string,
  formFocused: boolean,
  playerIsPlaying: boolean,
  previewUrl: string,
  isTyping: boolean,
  messagesVisible: number,
  messageQueue: Array<Object>,
  savedAppleMusic: boolean,
  savedSpotify: boolean,
  spotifyUserId: ?string,
  umFanId: ?string,
  messageCount: number,
  isOpen: boolean,
  playingTrackId: string,
  showSettings: boolean,
  connectText: string,
  thankYouText: string,
  releaseExternalURLs: Object,
  colors: Array<any>,
  coverArtWidth: number,
  coverArtHeight: number,
};

@autobind
class FanPageReleaseApp extends React.Component<Props, State> {
  postAuthEvent: (data: string) => void
  spAuthManager: SpotifyAuthManager
  fanPage: React.ElementRef<any>
  playPauseTimeout = 0
  messageTimeouts = {}
  scrollInterval = 0
  scrollTimeout = 0
  appleAuth: AppleMusicAuth
  trackList: React.ElementRef<any>
  discography: React.ElementRef<any>
  listHeight = 'auto'
  dsps: Array<any>
  coverArt: React.ElementRef<any>
  isSingle: Boolean

  constructor(props: Props) {
    super(props);

    this.state = {
      amUserToken: null,
      artistImgAssetId: this.props.artistImgAssetId || '',
      prefillData: undefined,
      submittedData: undefined,
      error: undefined,
      formFocused: false,
      playerIsPlaying: false,
      previewUrl: '',
      isTyping: true,
      messagesVisible: 0,
      messageQueue: [],
      savedAppleMusic: false,
      savedSpotify: false,
      spotifyUserId: null,
      umFanId: null,
      messageCount: 0,
      isOpen: true,
      playingTrackId: '',
      showSettings: false,
      connectText: props.fanPage.connect_text || contactMessages.connectText,
      thankYouText: props.fanPage.thank_you_text || contactMessages.thankYouText,
      releaseExternalURLs: {},
      colors: [],
      coverArtWidth: 0,
      coverArtHeight: 0,
    };

    this.fanPage = React.createRef();
    this.trackList = React.createRef();
    this.discography = React.createRef();
    this.coverArt = React.createRef();
    this.listHeight = '';

    this.spAuthManager = new SpotifyAuthManager();
    this.appleAuth = new AppleMusicAuth();
    this.appleAuth.configure();

    this.dsps = [{
      key: 'soundcloud',
      icon: () => (<IconSoundcloud />),
      displayName: 'Soundcloud',
    },
    {
      key: 'youtube',
      icon: () => (<IconYoutube />),
      displayName: 'YouTube',
    },
    {
      key: 'apple_music',
      icon: () => (<IconAppleMusic />),
      displayName: 'Apple Music',
    },
    {
      key: 'tidal',
      icon: () => (<IconTidal />),
      displayName: 'Tidal',
    },
    {
      key: 'google_play',
      icon: () => (<IconGooglePlay />),
      displayName: 'Google Play',
    },
    {
      key: 'amazon_music',
      icon: () => (<IconAmazon />),
      displayName: 'Amazon Music',
    }];

  }

  componentDidMount() {
    const {artist, release} = this.props;
    const {umFanId} = this.state;

    fanPageAnalytics.track('Page View', artist.id, umFanId, {
      release_page: release.id,
    });

    if (window.localStorage) {
      try {
        const storageKey = `${this.props.artist.id}-contact`;
        const prefillDataRaw = window.localStorage.getItem(storageKey);
        let prefillData = null;
        try {
          prefillData = JSON.parse(prefillDataRaw);
        } catch (e) {
          console.warn(e);
        }
        if (prefillData) {
          this.setState({prefillData});
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (this.trackList.current) {
      // Before we close the tracklist container we need to know the container height
      this.listHeight = this.trackList.current ? this.trackList.current.clientHeight + 'px' : '0px';
    }


    // Spotify Auth
    this.spAuthManager.init((spSummary) => {
      postJSON('/spotify/artist-connect', {
        artist_um_id: this.props.artist.id,
        fan_um_id: spSummary.fan_um_id,
      }).then(() => {
        if (window.analytics) {
          window.analytics.track('FanReleasePage Auth Spotify Success', this.trackingData());
        }
        if (this.postAuthEvent) {
          this.postAuthEvent(spSummary.fan_um_id);
        }
        this.setState({
          spotifyUserId: spSummary.spotify_user_id,
          umFanId: spSummary.fan_um_id,
        });
      }).catch((e: ServerError) => {
        this.setState({error: e.message});
      });
    },
    (error) => {
      if (window.analytics) {
        const data = {
          ...this.trackingData(),
          error: error.message || error.type,
        };
        window.analytics.track('FanReleasePage Auth Spotify Fail', data);
      }
      this.setState({error: error.message});
    });

    // Get list of Track Order ID's and their asset Id's in the correct order
    const tracksInOrder = this.props.tracks && this.props.release.track_order || [];
    const tracks = tracksInOrder.map((track) => {
      return this.props.tracks.filter((trackInfo) =>
        trackInfo.id === track
      );
    });

    document.body.style.backgroundColor = '#000';

    const previewUrl: string = getTrackPreviewUrl(tracks[0][0].assets[0].id) || '';

    const drawerOpen = (document.documentElement.clientWidth <= MOBILE_MAX_WIDTH) ? false : true;

    // Interval to wait until the image loads so we know the width/height for the canvas
    // Also to see height of the trackDrawer
    const waitForCoverArt = setInterval(() => {
      if (this.coverArt.current.clientWidth) {
        this.setState({previewUrl, isOpen: drawerOpen, releaseExternalURLs: this.props.releaseExternalURLs,
          coverArtHeight: this.coverArt.current.clientHeight, coverArtWidth: this.coverArt.current.clientWidth});
        clearInterval(waitForCoverArt);
      }
    }, 100);

    this.setState({previewUrl});
  }

  componentDidUpdate(prevProps:Object, prevState:Object) {

    // if a change in the track
    if (prevState.previewUrl !== this.state.previewUrl) {
      if (prevState.playingTrackId !== '') {
        window.umTrackPlayer.play();
        this.setState({playerIsPlaying: true});
      }
    }

    // if the First play from tracklist
    if (prevState.playingTrackId === '' && prevState.playingTrackId !== this.state.playingTrackId) {
      window.umTrackPlayer.play();
      this.setState({playerIsPlaying: true});
    }
  }

  componentWillUnmount() {
    clearTimeout(this.playPauseTimeout);
    Object.values(this.messageTimeouts).forEach(t => {
      if (typeof t === 'number') {
        clearTimeout(t);
      }
    });
    clearTimeout(this.scrollTimeout);
    clearInterval(this.scrollInterval);
  }

  getColors = (colors:Array<any>) =>
    this.setState(state => ({colors: [...state.colors, ...colors]}))

  trackingData() {
    return {
      artistId: this.props.artist.id,
      releaseId: this.props.release.id,
    };
  }

  handleBlur() {
    this.setState({formFocused: false});
  }

  handleFocus() {
    this.setState({formFocused: true});
  }

  toggleEditor(e: Event) {
    e.preventDefault();
    this.setState({showSettings: true});
  }

  togglePlayer() {
    const {artist, release} = this.props;
    const {umFanId} = this.state;
    // toggle between play or pause
    if (window.umTrackPlayer) {
      this.setState({playerIsPlaying: !this.state.playerIsPlaying});
      if (window.analytics) {
        window.analytics.track(`FanReleasePage ${(!window.umTrackPlayer.playing() ? 'Play' : 'Pause')} Pressed`, this.trackingData());
      }
      if (window.umTrackPlayer.playing()) {
        window.umTrackPlayer.pause();
        this.setState({playerIsPlaying: false});
      } else {
        // If the first track
        if (this.state.playingTrackId === '') {
          window.umTrackPlayer.play();
          if (this.props.release.track_order) {
            this.setState({playerIsPlaying: true, playingTrackId: this.props.release.track_order[0], isOpen: true});
          }
        } else {
          fanPageAnalytics.track('Song Preview', artist.id, umFanId, {
            release_page: release.id,
          });
          window.umTrackPlayer.play();
          this.setState({playerIsPlaying: true});
        }
      }
      return;
    }
  }

  saveSpotify() {
    const {artist, release} = this.props;
    const {umFanId} = this.state;

    if (window.analytics) {
      const spotifyTrack = 'FanReleasePage Spotify Clicked - ' + (this.props.releaseIsLive ? 'Save' : 'Pre-Save');
      window.analytics.track(spotifyTrack, this.trackingData());
    }

    fanPageAnalytics.track('Click Through', artist.id, umFanId, {
      release_page: release.id,
      store: 'Spotify Music',
    });

    if (!this.state.spotifyUserId) {
      this.spAuthManager.createAuthPopup(this.props.artist.id);
      this.postAuthEvent = (spotifyUserId: string) => {
        this.finishSaveSpotify(spotifyUserId);
      };
    } else {
      this.finishSaveSpotify(this.state.spotifyUserId);
    }
  }

  finishSaveSpotify(spotifyUserId: string) {
    postJSON('/fanpage/release/save-spotify', {
      fan_spotify_id: spotifyUserId,
      release_id: this.props.release.id,
    }).then(() => {
      this.setState({savedSpotify: true});
      if (window.analytics) {
        window.analytics.track('FanReleasePage Saved Spotify', this.trackingData());
      }
    }).catch((e) => {
      this.setState({error: e.message});
    });
  }

  saveAppleMusic() {
    const {artist, release} = this.props;
    const {umFanId} = this.state;

    if (window.analytics) {
      const appleTrack = 'FanReleasePage Apple Clicked - ' + (this.props.releaseIsLive ? 'Save' : 'Pre-Save');
      window.analytics.track(appleTrack, this.trackingData());
    }

    fanPageAnalytics.track('Click Through', artist.id, umFanId, {
      release_page: release.id,
      store: 'Apple Music',
    });
    this.appleAuth.auth()
    .then((token) => {
      this.setState({
        amUserToken: token,
      });
      if (this.props.appleTrackId) {
        this.appleAuth.getSongById(this.props.appleTrackId)
        .then((song) => {
          const albumId = song.relationships.albums.data[0]['id'];
          this.appleAuth.addAlbumToLibrary(albumId)
          .then(() => {
            this.setState({
              savedAppleMusic: true,
            });
          })
          .catch((e) => {
            this.setState({error: e.message});
          });
        })
        .catch((e) => {
          this.setState({error: e.message});
        });
      } else {
        postJSON('/fanpage/release/presave-apple', {
          token: token,
          release_id: this.props.release.id,
        });
      }
    });
  }

  renderDSP(dsp: Object) {
    const {artist, release} = this.props;
    const {umFanId} = this.state;
    const icon = dsp.icon;

    if (this.props.loggedInArtist && (this.props.artist.id === this.props.loggedInArtist.id)) {
      return (
        <div
          className={classNames(styles.DSP,  (this.state.releaseExternalURLs && this.state.releaseExternalURLs[dsp.key]) ? styles.Filled : styles.Empty)}
          onClick={() => {
            if (window.analytics) {
              window.analytics.track('FanReleasePage DSP Clicked', {...this.trackingData(),
                dsp: dsp.key});
            }

            window.open(this.state.releaseExternalURLs[dsp.key], '_blank');}
          }
        >
          {icon()}
          <span>{this.props.releaseIsLive ? 'PLAY' : ''}</span>
        </div>);
    } else {
      if (this.state.releaseExternalURLs && this.state.releaseExternalURLs[dsp.key]) {
        return (
          <div className={classNames(styles.DSP,  styles.Filled)}
            onClick={() => {
              if (window.analytics) {
                window.analytics.track('FanReleasePage DSP Clicked', {...this.trackingData(),
                  dsp: dsp.key});
              }

              fanPageAnalytics.track('Click Through', artist.id, umFanId, {
                release_page: release.id,
                store: dsp.displayName,
              });

              window.open(this.state.releaseExternalURLs[dsp.key], '_blank');}
            }
          >
            {icon()}
            <span>{this.props.releaseIsLive ? 'PLAY' : ''}</span>
          </div>
        );
      }
    }
  }

  closeSettings(data: Object) {
    this.setState({showSettings: false, releaseExternalURLs: data.release_external_urls});
  }

  handleTrackClick(track: Array<any>) {
    if (window.analytics) {
      const data = {
        ...this.trackingData(),
        trackId: track[0].id,
      };
      window.analytics.track('FanReleasePage Track on List Clicked', data);
    }

    // If different track, stop player and swap URL's
    if (this.state.playingTrackId !== track[0].id) {
      window.umTrackPlayer.stop();
      // TODO: DC need to pass in the URL change to audio visual???
      this.setState({previewUrl: getTrackPreviewUrl(track[0].assets[0].id), playingTrackId: track[0].id});
    } else {
      this.togglePlayer();
    }
  }

  handleDrawerClick() {
    if (window.analytics) {
      window.analytics.track('FanReleasePage TrackList Drawer Clicked', this.trackingData());
    }
    this.setState({isOpen: !this.state.isOpen});
  }

  trackFinished() {
    this.setState({playerIsPlaying: false});
  }

  render() {
    const {artist, release, releaseIsLive, loggedInArtist} = this.props;

    const {showSettings, savedSpotify, savedAppleMusic} = this.state;

    const {
      artistImgAssetId,
      connectText,
      prefillData,
      thankYouText,
    } = this.state;
    const artistName = artist && artist.profile && artist.profile.name || 'Artist Not Found';

    const trackIds = this.props.tracks && this.props.release.track_order || [];
    const coverArtURL = release && release.cover_art && getAssetThumbnailURLForID(release.cover_art.id);

    const isArtist = loggedInArtist && (artist.id === loggedInArtist.id);

    const heightStyle = {
      height: this.state.isOpen ? this.listHeight : 0,
      marginBottom: this.state.isOpen ? '20px' : 0,
    };

    const screenWidth = document.documentElement.clientWidth;

    const isSingle = (this.props.tracks.length === 1);
    const artistURL = artistName.toLowerCase();

    if (this.state.colors.length) {
      const highlightRGB = this.state.colors[this.state.colors.length-1];
      if (screenWidth <= MOBILE_MAX_WIDTH && this.discography.current) {
        const linearGradient = 'linear-gradient(0deg, rgba(15, 15, 15, 1) 0%, rgba(15, 15, 15, 1) 71%, rgba(' +
          highlightRGB[0] + ', ' + highlightRGB[1] + ', ' + highlightRGB[2] + ', 1) 100%)';

        this.discography.current.style.backgroundImage = linearGradient;
      }
    }

    return (
      <React.Fragment>
        <FanPageReleaseSettings
          artist={artist}
          release={release}
          releaseExternalURLs={this.state.releaseExternalURLs}
          closeSettings={this.closeSettings}
          showSettings={showSettings}
          externalLinks={this.dsps}
        />
        {showSettings && <OffCanvasPanelOverlay />}
        <div className={styles.FanPageWrap}>
          <div className={styles.FixedBackground}>
            <ColorExtractor getColors={this.getColors} rgb={true}>
              <img
                className={styles.Background}
                sizes="(max-width: 768px) 100vw, 70vw"
                srcSet={`${coverArtURL} 420w, ${coverArtURL} 700w`}
                src={coverArtURL}
              />
            </ColorExtractor>
          </div>
          {release && (
            <div className={styles.Discography} ref={this.discography}>
              <div className={styles.Release} key={release.id} onClick={this.togglePlayer}>
                <div className={styles.ReleaseCoverArt} ref={this.coverArt}>
                  <UnthemedSpinnableImage
                    src={coverArtURL}
                    isSquare={true}

                  />
                  <div className={styles.PlayerControl}>
                    {this.state.playerIsPlaying ? <IconPause /> : <IconPlayArrow />}
                  </div>
                </div>
                <AudioVisualizer
                  trackUrl={this.state.previewUrl}
                  onEnd={this.trackFinished}
                  coverArtWidth={this.state.coverArtWidth}
                  coverArtHeight={this.state.coverArtHeight}
                  isPlaying={this.state.playerIsPlaying}
                />
              </div>
              <div className={classNames(styles.Liner, styles.ArtistNameLink)}>
                <div className={styles.Details}>
                  <h2>{release.title}</h2>
                  <h4><a href={'https://' + window.location.hostname + '/' + artistURL} className={styles.ArtistLink}>{artistName}</a></h4>
                </div>
                {!isSingle && (
                  <React.Fragment>
                    <div ref={this.trackList} className={classNames(styles.TrackList)} style={heightStyle}>
                      <table>
                        {trackIds.map((t, index) => {
                          const track = this.props.tracks.filter((trackInfo) =>
                            trackInfo.id === t
                          );
                          return (
                            <tr className={styles.TrackTitles} onClick={() => this.handleTrackClick(track)}>
                              <td>
                                {index + 1}
                              </td>
                              <td>
                                <div className={this.state.playingTrackId === track[0].id ? 'TrackSelected' : ''}>{track[0].title}</div>
                              </td>
                              <td>
                                {''}
                              </td>
                            </tr>
                          );
                        })}
                      </table>
                    </div>
                    <div
                      className={classNames(styles.Menu, this.state.isOpen ? styles.Open : styles.Close)}
                      onClick={() => this.handleDrawerClick()}
                    >
                      <img src="/static/images/icons/chevron-down.png" />
                    </div>
                  </React.Fragment>
                )}
                {isArtist && (
                  <button className={styles.Edit} onClick={(e) => this.toggleEditor(e)}>
                    <IconEdit />
                  </button>
                )}
                <div className={styles.MusicServices}>
                  <div className={classNames(styles.Spotify)}>
                    {!savedSpotify ?
                      (<div onClick={this.saveSpotify} className={styles.Active}><IconSpotify /><p> {releaseIsLive ? ('SAVE') : ('PRE-SAVE')}</p></div>) :
                      (<div>{releaseIsLive ? ('SAVED') : (<span><b>PRE-SAVED</b><br />
                        <p>Release&nbsp;Date<br /> {moment(release['release_date']).format('ll')}</p></span>)}</div>)
                    }
                  </div>
                  <div className={classNames(styles.Apple)}>
                    {!savedAppleMusic ?
                      (<div onClick={this.saveAppleMusic} className={styles.Active}> <IconApple /><p>{releaseIsLive ? ('ADD') : ('PRE-ADD')}</p></div>) :
                      (<div>{releaseIsLive ? ('ADDED') : (<span><b>PRE-ADDED</b><br />
                        <p>Release&nbsp;Date<br /> {moment(release['release_date']).format('ll')}</p></span>)}</div>)
                    }
                  </div>

                  {(isArtist || (!isArtist && releaseIsLive)) &&
                    this.dsps.map((dsp) => {
                      return (this.renderDSP(dsp));
                    })}

                </div>
                <div className={styles.Legal}>
                  <p>
                  By saving, you agree to follow artist and have this music added to
                  your Spotify or Apple Music. <br />
                    <a href="/privacy" target="_blank">Privacy</a> | <a href="/terms" target="_blank">Terms</a>
                  </p>
                </div>
              </div>
            </div>

          )}
          <div className={styles.UMLogo}>
            <div>
              <a href="https://unitedmasters.com/" target="_blank">
                <IconUMLogo />
              </a>
            </div>
          </div>
          <ArtistPageMessages
            artist={artist}
            artistImgAssetId={artistImgAssetId}
            connectText={connectText}
            fanPage={this.fanPage}
            loggedInArtist={loggedInArtist}
            prefillData={prefillData}
            thankYouText={thankYouText}
            source={'fanreleasepage:' + this.props.release.id}
          />
        </div>
      </React.Fragment>
    );
  }
}

export default FanPageReleaseApp;
