/* lol */

if (typeof browser == "undefined" && typeof chrome == "object") {
    console.log('polyfilling chrome lol');
    browser = chrome;
    if (!browser.menus) browser.menus = browser.contextMenus;
    if (!browser.browserAction) browser.browserAction = browser.action;
}

const SCHEMES = [
        /^(http)s?:$/, /^(file):$/, /^s?(ftp):$/, /^(about):$/, /(.*)/];

function compareSchemes (a, b) {
    let elems = [a, b].map(x => {
        let scheme = x.protocol.toLowerCase();
        let rank   = SCHEMES.findIndex(y => { return scheme.match(y); });
        return [rank, scheme.match(SCHEMES[rank])[1]];
    });
    let cmp = elems[0][0] - elems[1][0];
    if (cmp == 0) {
        a = elems[0][1];
        b = elems[1][1];
        return a < b ? -1 : a > b ? 1 : 0;
    }
    return cmp;
}

function compareDomains (a, b) {
    let elems = [a, b].map(x => {
        x = x.hostname.toLowerCase().replace(/^www\d*\./, '');
        return x.split('.').reverse();
    });

    while (elems[0].length > 0 || elems[1].length > 0) {
        let d1 = elems[0].shift() || '';
        let d2 = elems[1].shift() || '';
        if (d1 == d2) continue;
        return d1 < d2 ? -1 : 1;
    }

    return 0;
}

function compareLocal (a, b) {
    let elems = [a, b].map(x => {
        return x.pathname + x.search + x.hash;
    });
    a = elems[0];
    b = elems[1];
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareURIs (a, b) {
    if (!(a instanceof URL)) a = new URL(a);
    if (!(b instanceof URL)) b = new URL(b);

    // console.debug(`${a} <=> ${b}`);

    let cmp = compareSchemes(a, b);
    if (cmp === 0) {
        cmp = compareDomains(a, b);
        if (cmp === 0) cmp = compareLocal(a, b);
    }
    // console.debug(`${a} ${cmp < 0 ? '<' : cmp > 0 ? '>' : '='} ${b}`);
    return cmp;
}

function compareTabs (a, b) {
    // note the inversion here is deliberate
    let ap = a.pinned ? 0 : 1;
    let bp = b.pinned ? 0 : 1;
    // pinned tabs always come before unpinned tabs
    let cmp = ap - bp;
    if (cmp === 0) {
        cmp = compareURIs(a.url, b.url);
        if (cmp === 0) {
            // we want this reversed
            cmp = b.lastAccessed - a.lastAccessed;
        }
    }

    return cmp;
}

function moveTabs (id, spec, fn) {
    if (browser.tabs.move.length == 1) {
        let p = browser.tabs.move(id, spec);
        return fn ? p.then(fn) : p;
    }
    return browser.tabs.move(id, spec, fn || function () {});
}

function getTabs (spec, func) {
    if (browser.tabs.query.length == 1)
        return browser.tabs.query(spec).then(func);
    return browser.tabs.query(spec, func);
}

function sortTabsByDomain (tab) {
    browser.storage.sync.get('pinned-tabs').then(p => {
        p = typeof p['pinned-tabs'] === 'undefined' ? true : p['pinned-tabs'];

        let mt = t => {
            t.sort(compareTabs);
            for (let i = 0; i < t.length; i++) {
                if (t[i].pinned && !p) continue;
                moveTabs(t[i].id, { index: i });
            }
        };

        getTabs({ currentWindow: true }, mt);
    });
}


browser.browserAction.onClicked.addListener(sortTabsByDomain);

/* Here is all the crap to do with Tabs To New Window */

// This function is a noop for now
function menuCreated (m) {
    if (typeof m !== 'undefined') console.log(m);
}

// This structure maps menu item IDs to sets of tabs. It is referenced
// when a menu item is clicked, and it is torn down and repopulated
// every time the menu is refreshed.
const TAB_MAP = {};

const CONTEXTS = ['all', 'page', 'action']; // 'tab'

// This is a dispatch table that refines browser.menus.onShown by
// mapping menu item IDs to handler functions which are proxied by
// the main event listener.
const SHOWN = {
    // The root menu item is currently the only one with a handler.
    // This function ensures that the menu is only available for tabs
    // with URIs that have hostnames (for now, a scope constraint). It
    // also wipes and regenerates the submenus and the state object
    // used to inform any subsequent click action.
    ttnw: async function (info, tab) {

        // first order of business is to wipe out the submenus and the
        // contents of the state object
        for (let tm in TAB_MAP) {
            await browser.menus.remove(tm);
            delete TAB_MAP[tm];
        }

        // parse the URI to make it useful
        let url = new URL(tab.url);
        if (url.hostname !== '') {
            // process the domain name and split it into individual labels
            let d  = url.hostname.toLowerCase().replace(/^www\d*\.+/, '');
            let dl = d.split(/\.+/);

            //console.log(info, dl);

            // obtain the IDs of the tabs in this window
            let ids = (await browser.tabs.query({
                windowId: tab.windowId, pinned: false })).map(
                    t => t.id).filter((e, i, a) => a.indexOf(e) === i).sort(
                        (a, b) => a < b ? -1 : a > b ? 1 : 0);
            //console.log(ids);

            // create a submenu item for each successively broader
            // match on the domain name; the label also matches the
            // query mask (also this is why i don't feel like
            // supporting arbitrary URI schemes for now: the query
            // filter is limited.)
            let enable = false;
            for (let i = 0; i < dl.length; i++) {
                let base = `ttnw-${i+1}`;
                let mask = `*.${dl.slice(i).join('.')}`;
                let mine = []; // tabs in this window
                let othr = []; // tabs in other windows
                let tabs = (await browser.tabs.query({
                    url: `*://${mask}/*`, pinned: false })).sort(compareTabs);
                // pinned tabs are unconditionally verboten since
                // people put them where they are for a reason

                // unfortunately you can't do this in the query but
                // you can't move tabs between private and non-private
                // windows so we filter them here
                tabs = tabs.filter(t => {
                    return t.incognito === tab.incognito; });

                // find the subset of tabs which are(n't) in this window
                tabs.map(t => {
                    (t.windowId === tab.windowId ? mine : othr).push(t); });

                // recycle the window if all the tabs are on this window
                let recycle = mine.length == ids.length &&
                    mine.every(t => ids.indexOf(t.id) >= 0);
                let variants = !recycle && othr.length > 0;

                //console.log(base, recycle);

                // append the number of objects to the title
                let title = mask + (variants ? '' : ` (${tabs.length})`);


                // skip if no-op
                if (recycle && othr.length == 0) continue;

                enable = true;

                await browser.menus.create({
                    id: base, parentId: 'ttnw', title: title,
                    contexts: CONTEXTS });

                if (variants) {
                    TAB_MAP[base] = {};

                    let v = {
                        current: [mine, 'From This Window Only'],
                        all: [tabs, 'From All Windows']
                    };

                    for (let j in v) {
                        let subid = `${base}-${j}`;
                        TAB_MAP[subid] = { recycle: false, tabs: v[j][0] };
                        let subtitle = v[j][1] + ` (${v[j][0].length})`;
                        await browser.menus.create({
                            id: subid,
                            parentId: base, title: subtitle,
                            contexts: CONTEXTS });
                    }
                }
                else {
                    TAB_MAP[base] = { recycle: recycle, tabs: tabs };
                }
                //console.log(tabs);
            }

            if (enable) await browser.menus.update('ttnw', { enabled: true });
        }
        await browser.menus.refresh();
    }
};

// add the root menu


browser.menus.create({
    id: "ttnw",
    title: 'Group Tabs to Window',
    //contexts: ["page", "tab"]
    contexts: CONTEXTS
}, menuCreated);

// add the listeners

if (browser.menus.onHidden) browser.menus.onHidden.addListener(
    async function () {
        await browser.menus.update('ttnw', { enabled: false });
    });

function tabWTF(info, tab) {
    let id = info.menuIds[0];
    if (SHOWN[id]) SHOWN[id](info, tab);
}

if (browser.menus.onShown) browser.menus.onShown.addListener(tabWTF);
else {
    // do the chrome thing

    // we may not need to look at web navigation

    /* browser.webNavigation.onCommitted.addListener(() => {
    }); */

    // tabs we just need onUpdated because onCreated may fire before
    // the url is set; we will definitely still need onRemoved though

    // let whatever = function (tab) {};

    // browser.tabs.onUpdated.addListener(whatever);
    // note this has a different argspec because of course it does
    // browser.tabs.onRemoved.addListener(whatever);
}

browser.menus.onClicked.addListener(async function (info, tab) {
    // obtain the list of tabs and whether to recycle the window
    let id      = info.menuItemId;

    // fucking chrome
    if (!TAB_MAP[id]) SHOWN[info.menuIds[0]](info, tab);
    else console.log(info, TAB_MAP[id]);

    let recycle = TAB_MAP[id].recycle;
    let targets = TAB_MAP[id].tabs;

    if (targets && targets.length > 0) {

        let win;
        if (recycle) {
            win = await browser.windows.get(tab.windowId);
        }
        else {
            let t = targets[0].id;
            await browser.tabs.reload(t);
            win = await browser.windows.create({ tabId: t });
        }

        // get the highest index of the target window
        let max = (await browser.tabs.query({ windowId: win.id })).reduce(
            (a, b) => { return a.index > b.index ? a : b; }, -1).index + 1;
        console.log(`next window position is ${max}`);

        // now move the remaining tabs
        targets.map((t, i) => {
            browser.tabs.move(t.id, { windowId: win.id, index: max + i }); });
    }
});
