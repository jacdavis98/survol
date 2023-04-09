const REQUEST_CACHE = {};

// Clear cache every 10 mins
setInterval(() => {
    Object.keys(REQUEST_CACHE).length = 0;
}, 1000 * 60 * 10);

const handleStateRequest = (req, sender) => {
    chrome.action.setBadgeText({
        text: req.data,
        tabId: sender.tab.id
    });
};

const handleFetchRequest = (req, sendResponse) => {
    new Promise(async (resolve) => {
        let res = { status: 'error', data: null };

        if (REQUEST_CACHE[req.data.url]) {
            res = REQUEST_CACHE[req.data.url];
            res.cached = true;
            resolve(res);
        } else {
            try {
                const data = await fetch(req.data.url);
                const result = req.data.noJSON ? await data.text() : await data.json();

                res.data = result;
                res.status = 'OK';
                res.cached = false;
                REQUEST_CACHE[req.data.url] = res;
                resolve(res);
            } catch (error) {
                res.data = error;
                res.status = 'error';
                resolve(res);
                console.error('SURVOL - Fetching error', error);
            }
        }
    }).then((response) => {
        sendResponse(response);
    });
};

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'state') {
        handleStateRequest(req, sender);
    } else if (req.action === 'request') {
        handleFetchRequest(req, sendResponse);
    } else {
        sendResponse({ action: 'none', status: 'OK' });
    }

    return true;
});

const DEFAULT_SETTINGS = {
    version: '0.7.0',
    disabledDomains: ['survol.me'],
    selfReferDisabled: ['github.com', 'ppy.sh'],
    previewMetadata: true,
    darkThemeToggle: false,
    installationType: 'install'
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (res) => {
        let oldVersion = res.version;
        res.version = DEFAULT_SETTINGS.version;

        if (res.installationType) {
            res.installationType = (res.version === oldVersion) ? 'none' : 'update';
        }

        Object.keys(DEFAULT_SETTINGS).forEach((key) => {
            res[key] = res[key] || DEFAULT_SETTINGS[key];
        });

        chrome.storage.local.set(res, () => {
            if (res.installationType === 'update' || res.installationType === 'install') {
                chrome.tabs.create({ url: chrome.runtime.getURL('./html/onboarding.html') });
            }
        });
    });
});

//iterate through all tabs and execute content script
chrome.runtime.onInstalled.addListener(async () => {
    for (const cs of chrome.runtime.getManifest().content_scripts) {
        for (const tab of await chrome.tabs.query({url: cs.matches})) {
            try {
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: cs.js,
                });
            } catch (e) {
                console.error("expected error trying to script on chrome webstore",e);
            }
        }
    }
});
