/* @flow */

import * as React from 'react';
import autobind from 'autobind-decorator';
import classNames from 'classnames';

import type {Release} from 'lib/types/Release';
import type {Artist} from 'lib/artists';
import {putJSON, ServerError} from 'lib/fetchJSON';

import Formsy from 'formsy-react';
import TextInput from 'lib/components/formsy-unthemed/TextInput';

import styles from './FanPageReleaseApp.css';

type Props = {
  artist: Artist,
  closeSettings: (Object) => void,
  release: Release,
  showSettings: boolean,
  releaseExternalURLs: Object,
  externalLinks: Array<any>,
}

type State = {
  artUploadQueue: Array<Object>,
  currentModule: string,
  inProgress: boolean,
  uploadError?: string,
  error: ?string,
  urls: Object,
}

@autobind
class FanPageReleaseSettings extends React.Component<Props, State> {

  constructor(props: Props, context: Object){
    super(props, context);

    this.state = {
      artUploadQueue: [],
      currentModule: '',
      inProgress: false,
      uploadError: undefined,
      error: undefined,
      setOpacity: false,

      urls: {
        soundcloud: '',
        youtube: '',
        itunes_store: '',
        tidal: '',
        amazon_music: '',
        google_play: '',
      },
    };
  }

  componentDidUpdate(prevProps:Object) {
    if (!prevProps.releaseExternalURLs.release_id &&
      this.props.releaseExternalURLs.release_id) {
      const {_id,
        _time_created,
        _time_removed,
        _time_updated,
        release_id,
        ...urls} = this.props.releaseExternalURLs;

        // Sometimes we return other urls outside of our DSPs
      Object.keys(this.state.urls).map((dsp) => {
        if (!urls[dsp]) {
          urls[dsp] = this.state.urls[dsp];
        }
      });

      this.setState({
        urls: {
          ...urls,
        },
      });
    }

  }

  closeSettings() {
    this.handleUpdateUrls();
  }

  handleUpdateUrls() {
    putJSON('/me/releases/' + this.props.release.id + '/external_urls', {
      urls: {
        ...this.state.urls,
      },
    }).then((data) => {
      this.props.closeSettings(data);
    }).catch((e: ServerError) => {
      this.setState({error: e.message});
    });
  }

  onChangeExternalURL(name: string, value: string) {
    this.setState({
      urls: {
        ...this.state.urls,
        [name]: value,
      },
    });
  }

  selectField(e: Event) {
    const target = e.target;
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }

  render() {
    document.body.style.backgroundColor = '#fff';

    const {externalLinks, releaseExternalURLs} = this.props;

    return (
      <div
        className={classNames(styles.Settings, {
          [styles.SettingsOn]: this.props.showSettings,
        })}
      >
        <div className={styles.SettingsForm}>
          <section className={styles.MessageForm}>
            <Formsy
              onValidSubmit={this.closeSettings}
            >
              <div className={styles.SettingsHeader}>
                <button
                  className={styles.DoneButton}
                  tabIndex="6"
                  type="submit"
                >
                  Done
                </button>
              </div>
              <h3 className={styles.EditHeader}>Edit Links</h3>
              <div className={styles.TextInput}>
                <label className={styles.FormLabel}>Spotify</label>
                <TextInput
                  className={styles.FormTextInput}
                  name="spotify"
                  placeholderText="Connected"
                  tabIndex="-1"
                  readOnly
                />
              </div>

              <div className={styles.TextInput}>
                <label className={styles.FormLabel}>Apple Music</label>
                <TextInput
                  className={styles.FormTextInput}
                  name="apple"
                  placeholderText="Connected"
                  tabIndex="-1"
                  readOnly
                />
              </div>

              {externalLinks.map((link, idx) => {
                return (
                  <div className={styles.TextInput} key={link.key}>
                    <label className={styles.FormLabel}>
                      <div className={styles.FormLabel}>{link.displayName}</div>
                      <TextInput
                        placeholderText="Add Link"
                        className={styles.FormTextInput}
                        tabIndex={idx+1}
                        name={link.key}
                        onChange={this.onChangeExternalURL}
                        value={releaseExternalURLs[link.key]}
                        onFocus={this.selectField}
                        validations={{isUrl: true}}
                        validationErrors={{
                          isUrl: 'Needs to be a proper URL',
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </Formsy>
          </section>
        </div>
      </div>
    );
  }
}

export default FanPageReleaseSettings;
