/* lol */

const SCHEMES = [/^https?:$/, /^file:$/, /^ftp:$/, /^about:$/, /.*/];

function compareSchemes (a, b) {
    var elems = [a, b].map(x => {
        var scheme = x.protocol.toLowerCase();
        var rank   = SCHEMES.findIndex(y => { return scheme.match(y) });
        return [rank, scheme];
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
        x = x.hostname.toLowerCase().replace(/www\d+/, '');
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
    var cmp = compareSchemes(a, b);
    if (cmp == 0) {
        cmp = compareDomains(a, b);
        if (cmp == 0) cmp = compareLocal(a, b);
    }
    return cmp;
}

function compareTabs (a, b) {
    // note the inversion here is deliberate
    var ap = a.pinned ? 0 : 1;
    var bp = b.pinned ? 0 : 1;
    // pinned tabs always come before unpinned tabs
    var cmp = ap - bp;
    if (cmp == 0) {
        cmp = compareURIs(a.url, b.url);
        if (cmp == 0) {
            // we want this reversed
            cmp = b.lastAccessed - a.lastAccessed;
        }
    }

    return cmp;
}

function sortTabsByDomain (tab) {
    var p = browser.tabs.query({ currentWindow: true });
    p.then(t => {
        t.sort(compareTabs);
        //console.log(t);
        for (var i = 0; i < t.length; i++) {
            browser.tabs.move(t[i].id, { index: i });
        }
    });
}

browser.browserAction.onClicked.addListener(sortTabsByDomain);
