/* lol */

if (typeof browser == "undefined" && typeof chrome == "object") {
    browser = chrome;
}

const SCHEMES = [
        /^(http)s?:$/, /^(file):$/, /^s?(ftp):$/, /^(about):$/, /(.*)/];

function compareSchemes (a, b) {
    var elems = [a, b].map(x => {
        var scheme = x.protocol.toLowerCase();
        var rank   = SCHEMES.findIndex(y => { return scheme.match(y) });
        return [rank, scheme.match(SCHEMES[rank])[1]];
    });
    var cmp = elems[0][0] - elems[1][0];
    if (cmp == 0) {
        a = elems[0][1];
        b = elems[1][1];
        return a < b ? -1 : a > b ? 1 : 0;
    }
    return cmp;
}

function compareDomains (a, b) {
    var elems = [a, b].map(x => {
        x = x.hostname.toLowerCase().replace(/^www\d*\./, '');
        return x.split('.').reverse();
    });

    while (elems[0].length > 0 || elems[1].length > 0) {
        var d1 = elems[0].shift() || '';
        var d2 = elems[1].shift() || '';
        if (d1 == d2) continue;
        return d1 < d2 ? -1 : 1;
    }

    return 0;
}

function compareLocal (a, b) {
    var elems = [a, b].map(x => {
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

    var cmp = compareSchemes(a, b);
    if (cmp === 0) {
        cmp = compareDomains(a, b);
        if (cmp === 0) cmp = compareLocal(a, b);
    }
    // console.debug(`${a} ${cmp < 0 ? '<' : cmp > 0 ? '>' : '='} ${b}`);
    return cmp;
}

function compareTabs (a, b) {
    // note the inversion here is deliberate
    var ap = a.pinned ? 0 : 1;
    var bp = b.pinned ? 0 : 1;
    // pinned tabs always come before unpinned tabs
    var cmp = ap - bp;
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
        var p = browser.tabs.move(id, spec);
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

        var mt = t => {
            t.sort(compareTabs);
            for (var i = 0; i < t.length; i++) {
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
    console.log(m);
}

// This structure maps menu item IDs to sets of tabs. It is referenced
// when a menu item is clicked, and it is torn down and repopulated
// every time the menu is refreshed.
const TAB_MAP = {};

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
        for (var tm in TAB_MAP) {
            await browser.menus.remove(tm);
            delete TAB_MAP[tm];
        }

        // parse the URI to make it useful
        var url = new URL(tab.url);
        if (url.hostname !== '') {
            // process the domain name and split it into individual labels
            var d  = url.hostname.toLowerCase().replace(/^www\d*\.+/, '');
            var dl = d.split(/\.+/);

            //console.log(info, dl);

            // obtain the IDs of the tabs in this window
            var ids = (await browser.tabs.query({
                windowId: tab.windowId, pinned: false })).map(
                    t => t.id).filter((e, i, a) => a.indexOf(e) === i).sort(
                        (a, b) => a < b ? -1 : a > b ? 1 : 0);
            //console.log(ids);

            // create a submenu item for each successively broader
            // match on the domain name; the label also matches the
            // query mask (also this is why i don't feel like
            // supporting arbitrary URI schemes for now: the query
            // filter is limited.)
            var enable = false;
            for (var i = 0; i < dl.length; i++) {
                var base = `ttnw-${i+1}`;
                var mask = `*.${dl.slice(i).join('.')}`;
                var mine = []; // tabs in this window
                var othr = []; // tabs in other windows
                var tabs = (await browser.tabs.query({
                    url: `*://${mask}/*`, pinned: false })).sort(compareTabs);
                // pinned tabs are unconditionally verboten since
                // people put them where they are for a reason

                // unfortunately you can't do this in the query but
                // you can't move tabs between private and non-private
                // windows so we filter them here
                tabs = tabs.filter(t => {
                    return t.incognito === tab.incognito });

                // find the subset of tabs which are(n't) in this window
                tabs.map(t => {
                    (t.windowId === tab.windowId ? mine : othr).push(t) });

                // append the number of objects to the title
                var title = mask +
                    (tabs.length === mine.length ? ` (${tabs.length})` : '');

                // recycle the window if all the tabs are on this window
                var recycle = mine.length == ids.length &&
                    mine.every(t => ids.indexOf(t.id) >= 0);

                console.log(base, recycle);

                // skip if no-op
                if (recycle && othr.length == 0) continue;

                enable = true;
               
                await browser.menus.create({
                    id: base, parentId: 'ttnw', title: title,
                    contexts: ['page', 'tab'] });

                if (!recycle && othr.length > 0) {
                    TAB_MAP[base] = {};

                    var v = {
                        current: [mine, 'From This Window Only'],
                        all: [tabs, 'From All Windows']
                    };

                    for (var j in v) {
                        var subid = `${base}-${j}`;
                        TAB_MAP[subid] = { recycle: false, tabs: v[j][0] };
                        var subtitle = v[j][1] + ` (${v[j][0].length})`;
                        await browser.menus.create({
                            id: subid,
                            parentId: base, title: subtitle,
                            contexts: ['page', 'tab'] });
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
    contexts: ["page", "tab"]
}, menuCreated);

// add the listeners

browser.menus.onHidden.addListener(async function () {
    await browser.menus.update('ttnw', { enabled: false });
});

browser.menus.onShown.addListener(function (info, tab) {
    var id = info.menuIds[0];
    if (SHOWN[id]) SHOWN[id](info, tab);
});

browser.menus.onClicked.addListener(async function (info, tab) {
    // obtain the list of tabs and whether to recycle the window
    var id      = info.menuItemId;
    var recycle = TAB_MAP[id].recycle;
    var targets = TAB_MAP[id].tabs;
    
    if (targets && targets.length > 0) {
        var win;
        if (recycle) {
            win = await browser.windows.get(tab.windowId);
        }
        else {
            var t = targets[0].id;
            win = await browser.windows.create({ tabId: t });
        }

        // get the highest index of the target window
        var max = (await browser.tabs.query({ windowId: win.id })).reduce(
            (a, b) => { return a.index > b.index ? a.index : b.index }, -1) ;
        console.log(max);

        // now move the remaining tabs
        targets.map((t, i) => {
            browser.tabs.move(t.id, { windowId: win.id, index: max + i }) });
    }
});
