const REQUEST_CACHE = {};

// Clear cache every 10 mins
setInterval(() => {
    Object.keys(REQUEST_CACHE).forEach(key => delete REQUEST_CACHE[key]);
}, 1000 * 60 * 10);

const handleStateRequest = (req, sender) => {
    chrome.action.setBadgeText({
        text: req.data,
        tabId: sender.tab.id
    });
};

const handleFetchRequest = async (req) => {
    let res = { status: 'error', data: null };

    const corsProxyUrl = 'https://thingproxy.freeboard.io/fetch/';
    const requestUrl = corsProxyUrl + req.data.url;

    if (REQUEST_CACHE[requestUrl]) {
        res = REQUEST_CACHE[requestUrl];
        res.cached = true;
    } else {
        try {
            const data = await fetch(requestUrl);
            const result = req.data.noJSON ? await data.text() : await data.json();

            res.data = result;
            res.status = 'OK';
            res.cached = false;
            REQUEST_CACHE[requestUrl] = res;
        } catch (error) {
            res.data = error;
            res.status = 'error';
            console.error('SURVOL - Fetching error', error);
        }
    }

    return res;
};

chrome.runtime.onConnect.addListener((port) => {
    console.assert(port.name === 'content');
    console.log('Connected to content script:', port);

    port.onMessage.addListener(async (req) => {
        if (port.sender.tab) {
            if (req.action === 'state') {
                handleStateRequest(req, port.sender);
            } else if (req.action === 'request') {
                const response = await handleFetchRequest(req);
                port.postMessage(response);
            } else {
                port.postMessage({ action: 'none', status: 'OK' });
            }
        }
    });
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
