# SnoozeTabs

[![CircleCI](https://circleci.com/gh/bwinton/SnoozeTabs.svg?style=svg)](https://circleci.com/gh/bwinton/SnoozeTabs)

An add-on to let you snooze your tabs for a while.

## How to run
* `npm install`

* To develop: `npm start`
  * Builds the extension
  * Starts a file watcher to rebuild on changes
  * Launches Firefox Dev Edition with the extension, reloaded on changes

* If youʼre on Windows, youʼll need to use `npm run start-win`
  * Builds the extension
  * Starts a file watcher to rebuild on changes

* To run once: `npm run build && npm run run`

* To build for release: `npm run build`

* To lint: `npm run lint`

* To work with a production-style release, set the env var `NODE_ENV=production`. 
  This will turn on production optiimzations, while turning off logging &
  various development conveniences. For example:
  * Continuous file watcher builds:
    * `NODE_ENV=production npm start`
  * Single one-shot build:
    * `NODE_ENV=production npm run build`

## Architectural Questions / Decisions…

* Spec?
  * At [this link][spec].
* Assets?
  * Coming soon.
* Should we write this as a [WebExtension][webext]?
  * YES!

* Add a “Developer Mode” with much shorter times, or an extra 3-second timer?
* We’ll need something to convert [Pontoon][pontoon]-format l10n files into [WebExtension l10n][l10n] files…


[flow]: https://flowtype.org/
[gulp]: http://gulpjs.com/
[grunt]: http://gruntjs.com/
[l10n]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Internationalization
[npm]: https://docs.npmjs.com/misc/scripts
[pontoon]: https://pontoon.mozilla.org/projects/
[sass]: http://sass-lang.com/
[spec]: https://mozilla.invisionapp.com/share/MV9F846SY#/screens
[webext]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
