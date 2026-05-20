[![unlicense](https://img.shields.io/badge/un-license-green.svg?style=flat)](https://unlicense.org)
[![Mozilla Add-on](https://img.shields.io/chrome-web-store/users/npbeifknocnjaoadlbboblifljieigog?logo=google-chrome&logoColor=white&color=blue
)](https://chromewebstore.google.com/detail/soundfixer/npbeifknocnjaoadlbboblifljieigog)

# SoundFixer

![Screenshot](https://lh3.googleusercontent.com/J0hcVJ1JhxnclFV-OdGuVVqScBDSQQvLRuoEmDNb6831Cfn16pZsnRCsOLGRk3coXKJdYwPOdyvARHZj-BbopItl=s1280-w1280-h800)

This project aims to solve issues towards Google Chrome's new policy where extensions that don't comply Manifest V3 would no longer work. This extension is rewritten with the help of AI.

This extension lets you fix annoying sound problems on the web (e.g. in YouTube videos): sound in one channel only, too quiet even at maximum volume, too loud even at minimum volume.

**Original Author's Version**: [Download on addons.mozilla.org](https://addons.mozilla.org/firefox/addon/soundfixer/)!

(NOTE: SoundFixer only exists for Firefox! Anything uploaded to other browsers' extension stores is not theirs! Please don't report bugs to [@valpackett](https://github.com/valpackett) if you use those.)

No more "[Plug your headphones only halfway into the jack](https://news.ycombinator.com/item?id=11912213)" :D

Unfortunately, this extension doesn't work on all websites — specifically, we're not allowed to use the Web Audio API from a cross-domain `<audio>` source. Thankfully, YouTube is not cross-domain!

## Popup Controls

The popup controls are designed to quickly fix common audio issues:

- **Mode**: Selects the method for boosting the audio (Note that this feature is exclusive to this extension and not present in the original Firefox version)
  - **Pure Gain**: Applies a linear gain to boost quiet audio (can cause clipping if overused)
  - **Limiter**: Uses a compressor to prevent clipping while boosting quiet audio (safer for loud sources)
- **Gain**: Increases or decreases the volume
- **Pan**: Shifts audio toward the left or right channel if sound is uneven
- **Mono**: Mixes left and right channels into a single centered signal (helpful when one channel is missing)
- **Flip L/R**: Swaps left and right channels when stereo channels are reversed
- **Reset**: Restores all controls to their default values

## Testing the extension locally

1. Download the latest release source code [here](https://github.com/raymond-1227/soundfixer-mv3/releases/latest)
2. Decompress the .zip file
3. Go to Chrome > Extensions > Manage Extensions
4. Enable Developer mode (at the top right corner)
5. Click "Load unpacked" (at the top left corner) and select the decompressed folder
6. Enjoy!

## Contributing

By participating in this project you agree to follow the [Contributor Code of Conduct](https://contributor-covenant.org/version/1/4/) and to release your contributions under the Unlicense.

## License

This is free and unencumbered software released into the public domain.  
For more information, please refer to the `UNLICENSE` file or [unlicense.org](https://unlicense.org).
