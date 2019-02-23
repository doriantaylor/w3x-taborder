/* lol */

if (typeof browser == "undefined" && typeof chrome == "object") {
    browser = chrome;
}

function togglePinned (ev) {
    //console.log(ev.target.checked);
    browser.storage.sync.set({ 'pinned-tabs': ev.target.checked });
    ev.preventDefault();
}

function restoreState () {
    //console.log('whiskey tango foxtrot');
    browser.storage.sync.get('pinned-tabs').then(x => {
        //console.log(x);
        document.getElementById('pinned').checked = x['pinned-tabs'];
    }, y => { console.log(y) });
}

const XHTMLNS = 'http://www.w3.org/1999/xhtml';

// there is some very weird behaviour in this, like 'await' not doing
// what it's supposed to etc

// anyway most of this code is dead 

async function populateBookmarks (roots, depth, selected) {
    if (!depth) depth = 0;
    if (!roots) roots = await browser.bookmarks.getTree();
    if (!selected)
        selected = await browser.storage.sync.get('tab-sweep-bookmarks');

    let bm = document.getElementById('bookmarks');

    await roots.forEach(async obj => {
        if (obj.type !== 'folder') return;

        let op = document.createElementNS(XHTMLNS, 'option');
        bm.appendChild(op);

        op.value = obj.id;

        if (obj.index == 0 && depth == 0) {
            op.text = '[Root]';
        }
        else {
            op.text = obj.title.padStart(obj.title.length + depth * 2, '\xA0');
        }

        let kids = await browser.bookmarks.getChildren(obj.id);
        await populateBookmarks(kids, depth + 1, selected);
    });
}

async function fetchBookmarks (roots) {
    if (!roots) roots = await browser.bookmarks.getTree();

    var out = [];

    await roots.forEach(async obj => {
        if (obj.type != 'folder') return;
        //if (obj.unmodifiable) return;
        console.log(obj.title, obj.type);
        var kids = await browser.bookmarks.getChildren(obj.id);
        //console.log(kids);
        var sub = await fetchBookmarks(kids); 
        //if (kids && kids.length > 0) sub = await fetchBookmarks(kids);
        console.log(sub);


        var me = [obj.id, obj.title];
        if (sub && sub.length > 0) me.push(sub);

        out.push(me);
    });


    return out;
}

const TS_KEY   = 'tab-sweep-bookmarks';
const TS_LABEL = 'Tab Sweeps';

async function getFolders (folders) {
    if (!folders) folders = await browser.bookmarks.getTree();
    //if (!depth)   depth   = 0;

    let out = [];
    folders.forEach(async bm => {
        if (bm.type != 'folder') return;
        let me = [bm.id, bm.title];
        if (bm.children && bm.children.length > 0) {
            me.push(await getFolders(bm.children));
        }
        out.push(me);
    });

    return out;
}

async function constructBookmarks (struct, root, selected, depth) {
    console.log(struct);
    if (!root) root = document.getElementById('bookmarks');

    if (!selected) {
        selected = await browser.storage.sync.get(TS_KEY);
        selected = selected[TS_KEY];
    }
    console.log(selected);
    //if (!selected) selected = TS_ID;
    if (!depth) depth = 0;

    await struct.forEach(async elem => {
        //console.log(elem);
      
        let opt = document.createElementNS(XHTMLNS, 'option');
        root.appendChild(opt);
        opt.value = elem[0];
        opt.text  = elem[1].padStart(elem[1].length + depth * 2, '\xA0');
        if (elem[0] === selected) opt.selected = true;

        if (elem[2]) {
            await constructBookmarks(elem[2], root, selected, depth + 1);
        }
    });
}


async function loadBookmarks () {
    getFolders().then(async struct => {
        let bm = document.getElementById('bookmarks');

        while (bm.childNodes.length > 0) bm.removeChild(bm.firstChild);

        let op = document.createElementNS(XHTMLNS, 'option');
        bm.appendChild(op);
        op.text = '[Default]';
        op.disabled = true;

        //console.log(struct);

        await constructBookmarks(struct, bm);
    }, (err) => { console.log(err); });
}

function setBookmarkFolder (e) {
    e.preventDefault();
    console.log(this.value);
    let v = this.value;
    let o = {};
    o[TS_KEY] = v;
    if (v && v != '') browser.storage.sync.set(o);
}


document.addEventListener('DOMContentLoaded', restoreState, false);
document.addEventListener('DOMContentLoaded', loadBookmarks, false);
document.getElementById('pinned').addEventListener(
    'change', togglePinned, false);
document.getElementById('bookmarks').addEventListener(
    'change', setBookmarkFolder, false);

browser.bookmarks.onChanged.addListener(e => { console.log(e); loadBookmarks(); } );
browser.bookmarks.onCreated.addListener(e => { console.log(e); loadBookmarks(); } );
browser.bookmarks.onMoved.addListener(e => { console.log(e); loadBookmarks(); } );
browser.bookmarks.onRemoved.addListener(e => { console.log(e); loadBookmarks(); } );
