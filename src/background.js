/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the 'License'). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

'use strict';

import { idForItem, makeLogger } from './lib/utils';
const log = makeLogger('BE');

import moment from 'moment';
import { getLocalizedDateTime } from './lib/time-formats';

import { NEXT_OPEN, PICK_TIME, times, timeForId } from './lib/times';
import Metrics from './lib/metrics';
import { getAlarms, saveAlarms, removeAlarms,
         getMetricsUUID, getDontShow, setDontShow } from './lib/storage';
const WAKE_ALARM_NAME = 'snooze-wake-alarm';

let iconData;
let closeData;

function updateButtonForTab(tabId, changeInfo) {
  if (changeInfo.status !== 'loading' || !changeInfo.url) {
    return;
  }
  browser.tabs.get(tabId).then(tab => {
    const url = changeInfo.url;
    if (!tab.incognito && (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:') ||
        url.startsWith('ftp:') || url.startsWith('app:'))) {
      browser.browserAction.setIcon({path: 'icons/bell_icon.svg', tabId: tabId});
    } else {
      browser.browserAction.setIcon({path: 'icons/disabled_bell_icon.svg', tabId: tabId});
    }
  }).catch(reason => {
    log('update button get rejected', reason);
  });
}

function init() {
  log('init()');
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      getMetricsUUID().then(clientUUID => {
        const title = browser.i18n.getMessage('uniqueBookmarkFolderTitle', clientUUID);
        return browser.bookmarks.search({title: title}).then(folders => {
          return Promise.all(folders.map(folder => {
            return browser.bookmarks.update(folder.id, {
              title: `${title} - ${getLocalizedDateTime(moment(), 'date_year')} ${getLocalizedDateTime(moment(), 'confirmation_time')}`
            });
          }));
        });
      }).catch(reason => {
        log('init bookmark folder rename rejected', reason);
      });
    }
  });
  browser.alarms.onAlarm.addListener(handleWake);
  browser.notifications.onClicked.addListener(handleNotificationClick);
  browser.runtime.onMessage.addListener(handleMessage);
  browser.tabs.onUpdated.addListener(updateButtonForTab);
  browser.tabs.onCreated.addListener(tab => {
    updateButtonForTab(tab.id, {'status': 'loading', url: tab.url});
  });
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      updateButtonForTab(tab.id, {'status': 'loading', url: tab.url});
    }
  }).catch(reason => {
    log('init tabs query rejected', reason);
  });

  if (!iconData) {
    fetch(browser.extension.getURL('icons/color_bell_icon.png')).then(response => {
      return response.arrayBuffer();
    }).then(function(response) {
      iconData = 'data:image/png;base64,' + btoa(String.fromCharCode(...new Uint8Array(response)));
    }).catch(reason => {
      log('init get iconData rejected', reason);
    });
  }

  if (!closeData) {
    fetch(browser.extension.getURL('icons/stop.svg')).then(response => {
      return response.arrayBuffer();
    }).then(function(response) {
      closeData = 'data:image/svg+xml;base64,' + btoa(String.fromCharCode(...new Uint8Array(response)));
    }).catch(reason => {
      log('init get closeData rejected', reason);
    });
  }

  getMetricsUUID().then(clientUUID => {
    Metrics.init(clientUUID);
    return getAlarms();
  }).then(items => {
    const due = Object.entries(items).filter(item => item[1].time === NEXT_OPEN);
    const updated = {};
    due.forEach(item => {
      item[1].time = Date.now();
      updated[item[0]] = item[1];
    });
    log('setting next open tabs to now', updated);
    return saveAlarms(updated).then(updateWakeAndBookmarks);
  }).catch(reason => {
    log('init storage get rejected', reason);
  });
}

function handleMessage({op, message}) {
  log('backend received', op, message);
  if (messageOps[op]) { messageOps[op](message); }
}

const messageOps = {
  schedule: message => {
    return getDontShow().then(dontShow => {
      if (dontShow) {
        return messageOps.confirm(message);
      }

      browser.tabs.executeScript(message.tabId, {file: './lib/confirm-bar.js'}).then(() => {
        return chrome.tabs.sendMessage(message.tabId, {message, iconData, closeData});
      }).catch(reason => {
        log('schedule inject rejected', reason);
        return messageOps.confirm(message);
      });
    });
  },
  confirm: message => {
    Metrics.scheduleSnoozedTab(message);
    const toSave = {};
    const tabId = message.tabId;
    delete message.tabId;
    toSave[idForItem(message)] = message;
    return browser.tabs.query({}).then(tabs => {
      if (tabs.length <= 1) {
        browser.tabs.create({
          active: true,
          url: 'about:home'
        });
      }
    }).then(() => {
      return saveAlarms(toSave);
    }).then(() => {
      if (tabId) {
        window.setTimeout(() => {
          browser.tabs.remove(tabId);
        }, 500);
      }
    }).then(updateWakeAndBookmarks).catch(reason => {
      log('confirm rejected', reason);
    });
  },
  cancel: message => {
    Metrics.cancelSnoozedTab(message);
    return removeAlarms(idForItem(message)).then(updateWakeAndBookmarks);
  },
  update: message => {
    Metrics.updateSnoozedTab(message);
    return messageOps.cancel(message.old).then(() => messageOps.confirm(message.updated));
  },
  setconfirm: message => {
    setDontShow(message.dontShow);
  },
  click: message => {
    Metrics.clickSnoozedTab(message);
  },
  panelOpened: () => {
    Metrics.panelOpened();
  }
};

function syncBookmarks(items) {
  getMetricsUUID().then(clientUUID => {
    const title = browser.i18n.getMessage('uniqueBookmarkFolderTitle', clientUUID);
    return browser.bookmarks.search({title: title}).then(folders => {
      if (folders.length) {
        return folders[0];
      }
      return browser.bookmarks.create({title: title});
    });
  }).then(snoozeTabsFolder => {
    log('Sync Folder!', snoozeTabsFolder, Object.values(items));
    return browser.bookmarks.getChildren(snoozeTabsFolder.id).then((bookmarks) => {
      const tabs = [...Object.values(items)];
      const toCreate = tabs.filter((tab) => !bookmarks.find((bookmark) => tab.url === bookmark.url));
      const toRemove = bookmarks.filter((bookmark) => !tabs.find((tab) => bookmark.url === tab.url));

      const operations = toCreate.map(item => {
        log(`Creating ${item.url}.`);
        return browser.bookmarks.create({
          parentId: snoozeTabsFolder.id,
          title: item.title,
          url: item.url
        });
      }).concat(toRemove.map(item => {
        log(`Removing ${item.url}.`);
        return browser.bookmarks.remove(item.id);
      }));
      return Promise.all(operations);
    });
  }).catch(reason => {
    log('syncBookmarks rejected', reason);
  });
}

function updateWakeAndBookmarks() {
  return browser.alarms.clearAll()
    .then(() => getAlarms())
    .then(items => {
      syncBookmarks(items);
      const times = Object.values(items).map(item => item.time).filter(time => time !== NEXT_OPEN);
      if (!times.length) { return; }

      times.sort();
      const nextTime = times[0];

      const soon = Date.now() + 5000;
      const nextAlarm = Math.max(nextTime, soon);

      log('updated wake alarm to', nextAlarm, ' ', getLocalizedDateTime(moment(nextAlarm), 'long_date_time'));
      return browser.alarms.create(WAKE_ALARM_NAME, { when: nextAlarm });
    });
}

function handleWake() {
  const now = Date.now();
  log('woke at', now);
  return getAlarms().then(items => {
    const due = Object.entries(items).filter(entry => entry[1].time <= now);
    log('tabs due to wake', due.length);
    return browser.windows.getAll({
      windowTypes: ['normal']
    }).then(windows => {
      const windowIds = windows.map(window => window.id);
      return Promise.all(due.map(([, item]) => {
        log('creating', item);
        const createProps = {
          active: false,
          url: item.url,
          windowId: windowIds.includes(item.windowId) ? item.windowId : undefined
        };
        return browser.tabs.create(createProps).then(tab => {
          Metrics.tabWoken(item, tab);
          browser.tabs.executeScript(tab.id, {
            'code': `
              function flip(newUrl) {
                let link = document.createElement('link');
                link.rel = 'shortcut icon';
                link.href = newUrl;
                document.getElementsByTagName('head')[0].appendChild(link);
                return link;
              }

              function reset(link) {
                link.remove();
                let prev = document.querySelectorAll('link[rel="shortcut icon"]');
                if (prev.length) {
                  document.getElementsByTagName('head')[0].appendChild(prev.item(prev.length - 1));
                }
              }

              let link;
              let flip_interval = window.setInterval(() => {
                if (link) {
                  reset(link);
                  link = undefined;
                } else {
                  link = flip('${iconData}');
                }
              }, 500);
              window.setTimeout(() => {
                window.clearInterval(flip_interval);
                if (link) {
                  reset(link);
                  link = undefined;
                }
              }, 10000)
              `
          });
          return browser.notifications.create(`${item.windowId}:${tab.id}`, {
            'type': 'basic',
            'iconUrl': 'chrome://branding/content/about-logo@2x.png',
            'title': item.title,
            'message': item.url
          });
        });
      })).then(() => {
        removeAlarms(due.map(entry => entry[0]));
      });
    });
  }).then(updateWakeAndBookmarks);
}

function handleNotificationClick(notificationId) {
  const [windowId, tabId] = notificationId.split(':');
  browser.windows.update(+windowId, {focused: true});
  browser.tabs.update(+tabId, {active: true});
}

let parent;

if (browser.contextMenus.ContextType.TAB) {
  const title = browser.i18n.getMessage('contextMenuTitle');
    parent = chrome.contextMenus.create({
    contexts: [browser.contextMenus.ContextType.TAB],
    title: title,
    documentUrlPatterns: ['<all_urls>']
  });
  for (const item in times) {
    const time = times[item];
    if (time.id === PICK_TIME) {
      continue;
    }
    chrome.contextMenus.create({
      parentId: parent,
      id: time.id,
      contexts: [browser.contextMenus.ContextType.TAB],
      title: time.title,
    });
  }

  browser.contextMenus.onClicked.addListener(function(info, tab) {
    if (tab.incognito) {
      return; // Canʼt snooze private tabs
    }
    const title = browser.i18n.getMessage('notificationTitle');
    const [time, ] = timeForId(moment(), info.menuItemId);
    handleMessage({
      'op': tab.active ? 'schedule' : 'confirm',
      'message': {
        'time': time.valueOf(),
        'timeType': info.menuItemId,
        'title': tab.title || title,
        'url': tab.url,
        'tabId': tab.id,
        'windowId': tab.windowId
      }
    });
  });
}

init();
