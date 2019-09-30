/* @flow */

import * as React from 'react';
import autobind from 'autobind-decorator';
import {Howl, Howler} from 'howler';

import styles from './AudioVisualizer.css';

type Props = {
  trackUrl: string,
  onEnd: () => void,
  coverArtHeight: number,
  coverArtWidth: number,
}

type State = {
  animation: boolean,
}

@autobind
class AudioVisualizer extends React.Component<Props, State> {
  canvas: React.ElementRef<any>
  audio: React.ElementRef<any>
  coverArtWidth: number
  coverArtHeight: number


  constructor(props: Props) {
    super(props);


    this.state = {
      animation: false,
    };

    this.canvas = React.createRef();
  }

  componentWillReceiveProps(nextProps: Props) {
    if (this.props.trackUrl !== nextProps.trackUrl) {
      this.initializePlayer(nextProps.trackUrl);
    }
  }

  initializePlayer(trackUrl: string) {
    window.umTrackPlayer = new Howl({
      src: [trackUrl],
      format: ['wav'],
      volume: 1,
      html: true,
      onload: () => {
      },
      onplay: () => {
        this.setState({animation: true});
        this.animateVisual();
      },
      onstop: () => {
        this.setState({animation: false});
        window.cancelAnimationFrame(window.visualAnimation);
        this.animateVisual();
      },
      onpause: () => {
        this.setState({animation: false});
        window.cancelAnimationFrame(window.visualAnimation);
        this.animateVisual();
      },
      onend: () => {
        this.setState({animation: false});
        window.cancelAnimationFrame(window.visualAnimation);
        this.props.onEnd();
        this.animateVisual();

        this.canvas.current.getContext('2d').clearRect(0, 0,
          this.canvas.current.clientWidth, this.canvas.current.clientHeight);
      },
    });
  }

  animateVisual = () => {
    const ctx = this.canvas.current.getContext('2d');

    // Audio using HOWL
    const analyser = Howler.ctx.createAnalyser();
    Howler.masterGain.connect(analyser);
    analyser.connect(Howler.ctx.destination);


    /////////////// ANALYSER FFTSIZE ////////////////////////
    //analyser.fftSize = 32;
    // analyser.fftSize = 64;
    // analyser.fftSize = 128;
    // analyser.fftSize = 256;
    // analyser.fftSize = 512;
    // analyser.fftSize = 1024;
    // analyser.fftSize = 2048;
    // analyser.fftSize = 4096;   // this one for desktop
    analyser.fftSize = 8192;
    // analyser.fftSize = 16384;
    // analyser.fftSize = 32768;

    // (FFT) is an algorithm that samples a signal over a period of time
    // and divides it into its frequency components (single sinusoidal oscillations).
    // It separates the mixed signals and shows what frequency is a violent vibration.

    // (FFTSize) represents the window size in samples that is used when performing a FFT

    // Lower the size, the less bars (but wider in size)
    ///////////////////////////////////////////////////////////


    const bufferLength = analyser.frequencyBinCount; // (read-only property)
    //console.log('bufferLength: ', bufferLength);
    // Unsigned integer, half of fftSize (so in this case, bufferLength = 8192)
    // Equates to number of data values you have to play with for the visualization

    // The FFT size defines the number of bins used for dividing the window into equal strips, or bins.
    // Hence, a bin is a spectrum sample, and defines the frequency resolution of the window.

    const dataArray = new Uint8Array(bufferLength); // Converts to 8-bit unsigned integer array
    // At this point dataArray is an array with length of bufferLength but no values
    //console.log('DATA-ARRAY: ', dataArray); // Check out this array of frequency values!

    const WIDTH = this.canvas.current.clientWidth;
    const HEIGHT = this.canvas.current.clientHeight;
    //console.log('WIDTH: ', WIDTH, 'HEIGHT: ', HEIGHT);

    const barWeight = 13;  // Higher = Wider, Lower = Narrow
    //const numOfBars = 50;
    const padding = 2;

    const barWidth = (WIDTH / bufferLength) * barWeight;
    //console.log('BARWIDTH: ', barWidth);

    // TOTAL WIDTH = NumOfBars * (widthOfBar + padding)
    // NumOfBars = Total Width / (widthOfBar + padding)
    const numOfBars = WIDTH / (barWidth + padding);
    //console.log('numOfBars ', numOfBars);

    //console.log('TOTAL WIDTH: ', numOfBars * (barWidth + padding));

    let barHeight;
    let x = 0;

    const animation = this.state.animation;

    function renderFrame() {
      if (animation) {
        // Takes callback function to invoke before rendering
        window.visualAnimation = requestAnimationFrame(renderFrame);
      }

      x = 0;
      analyser.getByteFrequencyData(dataArray); // Copies the frequency data into dataArray
      // Results in a normalized array of values between 0 and 255
      // Before this step, dataArray's values are all zeros (but with length of 8192)
      //console.log(dataArray);
      //ctx.fillStyle = 'rgba(0,0,0,0.1)'; // Clears canvas before rendering bars (black with opacity 0.2)
      //ctx.fillRect(0, 0, WIDTH, HEIGHT); // Fade effect, set opacity to 1 for sharper rendering of bars
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      let r, g, b;
      //const bars = 118; // Set total number of bars you want per frame

      // 147
      // 255

      for (let i = 0; i < numOfBars; i++) {
        // Makes sure the barHeight is within the canvas Height

        // normalize to 255 how bytes are given
        // we want to show bars even when they are zero so we bump it to 25
        barHeight = (dataArray[i] <= 25) ? (25 / 255) * HEIGHT : ((dataArray[i]) / 255) * HEIGHT;

        if (barHeight >= (HEIGHT / 3)){ // gold
          r = 200;
          g = 177;
          b = 111;
        } else if (barHeight >= (HEIGHT / (2/3))){ // grey
          r = 199;
          g = 199;
          b = 199;
        } else { // light grey
          r = 144;
          g = 144;
          b = 144;
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const y = HEIGHT - barHeight;
        // (x, y, i, j) - (x, y) Represents start point - (i, j) Represents end point
        ctx.fillRect(x, y, barWidth, barHeight);

        x += barWidth + padding; // Gives 10px space between each bar
      }
    }

    renderFrame();
  }


  render() {

    return (
      <canvas
        className={styles.canvas}
        ref={this.canvas}
        height={this.props.coverArtHeight / 2.5}
        width={this.props.coverArtWidth}
      >
      </canvas>
    );
  }
}

export default AudioVisualizer;
