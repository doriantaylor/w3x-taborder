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

/* here is all the crap to do with Tabs To New Window */

function menuCreated (m) {
    console.log(m);
}

browser.menus.create({
    id: "ttnw",
    title: 'Tabs to New Window',
    contexts: ["page", "tab"]
}, menuCreated);

const SUBMENUS = [];

for (var i = 1; i <= 5; i++) {
    var id = 'ttnw-s' + i;
    SUBMENUS.push(id);
    browser.menus.create({
        id: id,
        parentId: 'ttnw',
        title: 'placeholdurr',
        contexts: ['page', 'tab']
    });
}

browser.tabs.onActivated.addListener(function (obj) {
    console.log(obj);
    browser.tabs.get(obj.tabId).then(function (fu) {
        var url = new URL(fu.url);
        var d = url.hostname.toLowerCase().replace(/^www\d*\./, '');
        var dp = d.split(/\.+/);
        console.log(dp);

        for (var i = 0; i < dp.length; i++) {
            var sl = dp.slice(i);
            var lol = `*.${sl.join('.')}`;
            browser.menus.update("ttnw-s" + (i + 1), { title: lol });
        }

    }, function (wah) { console.error(wah) });
});
