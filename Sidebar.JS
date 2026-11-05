    /*!
    * sidebar.js — drop-in sidebar for any page.
    *
    * Usage:
    *   <script src="sidebar.js" defer></script>
    *
    * Options (all optional, set as data attributes on the script tag):
    *   data-offset="false"   Don't push the page content to the right of the sidebar.
    *
    * The sidebar lives in a Shadow DOM, so its CSS can't clash with your page's CSS
    * (and your page's CSS can't break the sidebar).
    */

    (function () {
    'use strict';

    var HOST_ID = 'bf-sidebar-host';
    var script = document.currentScript;
    var applyOffset = !(script && script.dataset.offset === 'false');

    // ---------- CONFIG: edit your content here ----------
    var CONFIG = {
        name: 'Ben Finkelstein',
        subtitle: 'EdTech',
        links: [
        { label: 'Home', href: 'https://bfinkelsteinedu.carrd.co/', newTab: true },
        { label: 'Landing', href: 'https://citruscryptid.github.io/EME6208-Projects/index.html' },
        { label: 'Gibbon Quiz', href: 'https://citruscryptid.github.io/EME6208-Projects/gibbon-quiz/index.html' },
        { label: 'Drag & Drop - OG', href: 'https://citruscryptid.github.io/EME6208-Projects/drag-drop/index.html' },
        { label: 'Drag & Drop - AI Version', href: 'https://citruscryptid.github.io/EME6208-Projects/drag-ai/index.html' },
        { label: 'Muscle Trainer Game', href: 'https://citruscryptid.github.io/AnatomyGame/' },
        ]
    };

    // ---------- STYLES (inside the shadow root) ----------
    var SIDEBAR_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');


        /* Reset inherited page styles inside the isolated sidebar shadow root. */
        :host { all: initial; }
        /* Keep sidebar dimensions predictable and clear browser spacing defaults. */
        .sidebar, .sidebar * { box-sizing: border-box; }
        .sidebar * { margin: 0; padding: 0; }

        /* Draw the fixed-width, dark sidebar rail and its shared color tokens. */
        .sidebar {
        --sidebar-width: 300px;
        --bg: #1e1e1e;
        --border: #3c3c3c;
        --text: #d4d4d4;
        --muted: #9d9d9d;
        --accent: #007acc;

        font-family: 'Poppins', system-ui, -apple-system, sans-serif;
        font-size: 16px;
        line-height: 1.5;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        position: fixed;
        left: 0;
        top: 0;
        height: 100vh;
        height: 100dvh;
        width: var(--sidebar-width);
        overflow-y: auto;
        padding: 1.5rem 1rem;
        color: var(--text);
        background: linear-gradient(155deg, #2d2d30, var(--bg) 72%);
        border-right: 1px solid var(--border);
        box-shadow: 8px 0 32px rgba(0, 0, 0, .22);
        z-index: 1000;
        }

        /* Center the name and subtitle at the top of the rail. */
        .sidebar-header {
        font-family: 'Poppins', system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 1.5rem;
        padding: 1rem .5rem 1.25rem;
        border-bottom: 1px solid var(--border);
        }

        .logo {
        display: flex;
        width: 100%;
        flex-direction: column;
        align-items: center;
        gap: .2rem;
        white-space: nowrap;
        }

        /* Make the sidebar name the visual heading while keeping it inside the rail. */
        .logo-name {
        max-width: none;
        white-space: nowrap;
        text-align: center;
        font-family: 'Poppins', system-ui, -apple-system, sans-serif;
        color: var(--text);
        font-size: 2.2rem;
        line-height: 1.05;
        font-weight: 600;
        letter-spacing: -.03em;
        text-shadow: 0 2px 0 rgba(0, 0, 0, .7), 0 5px 14px rgba(0, 0, 0, .55);
        }

        .logo-subtitle {
        font-family: 'Poppins', system-ui, -apple-system, sans-serif;
        color: var(--accent);
        font-size: 1rem;
        font-weight: 500;
        text-align: center;
        letter-spacing: .08em;
        text-transform: uppercase;
        text-shadow: 0 2px 0 rgba(0, 0, 0, .7), 0 5px 14px rgba(0, 0, 0, .55);
        }

        /* Stack navigation links with consistent spacing. */
        .nav-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: .45rem;
        }

        /* Give each destination a full-width, high-contrast clickable row. */
        .nav-link {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: .7rem .85rem;
        color: var(--muted);
        text-decoration: none;
        border-radius: 10px;
        transition: color .2s ease, background .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease;
        font-size: .9rem;
        font-weight: 500;
        background: rgba(255, 255, 255, .015);
        border: 1px solid transparent;
        white-space: normal;
        overflow-wrap: anywhere;
        }

        .nav-link:hover, .nav-link:focus-visible {
        background: linear-gradient(135deg, rgba(55, 148, 255, .14), rgba(0, 122, 204, .04));
        color: var(--accent);
        transform: translateX(5px);
        border-color: rgba(55, 148, 255, .35);
        box-shadow: 0 6px 18px rgba(0, 0, 0, .18);
        outline: none;
        }

        .nav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* Turn the rail into a compact full-width navigation panel on small screens. */
        @media (max-width: 768px) {
        .sidebar {
            width: 100%;
            height: auto;
            max-height: 45vh;
            position: relative;
            padding: .8rem 1rem;
            border-right: 0;
            border-bottom: 1px solid var(--border);
        }
        .sidebar-header { margin-bottom: .55rem; padding: .25rem .5rem .65rem; }
        .logo { gap: .1rem; }
        .logo-subtitle { font-size: .9rem; }
        .nav-list {
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            gap: .4rem;
        }
        .nav-item { min-width: 0; }
        .nav-link {
            width: auto;
            white-space: normal;
            min-height: 38px;
            padding: .5rem .75rem;
            font-size: .8rem;
            transform: none;
        }
        .nav-link:hover, .nav-link:focus-visible { transform: translateY(-2px); }
        }

        /* Reduce spacing and type slightly on narrow phones. */
        @media (max-width: 480px) {
        .sidebar { padding: .65rem .75rem; }
        .nav-link { min-height: 34px; padding: .4rem .6rem; font-size: .75rem; }
        }

        @media (prefers-reduced-motion: reduce) {
        .nav-link { transition: none; }
        }
    `;


    // ---------- PAGE-LEVEL CSS (pushes content past the fixed sidebar) ----------
    // Match the page offset to the 300px desktop sidebar width.
    var PAGE_CSS = `
        body { margin-left: 300px; }
        @media (max-width: 768px) {
        body { margin-left: 0; }
        }
    `;

    // ---------- HELPERS ----------
    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function buildMarkup() {
        var items = CONFIG.links.map(function (l) {
        var external = l.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        return (
            '<li class="nav-item">' +
            '<a href="' + escapeHTML(l.href) + '" class="nav-link"' + external + '>' +
                '<span>' + escapeHTML(l.label) + '</span>' +
            '</a>' +
            '</li>'
        );
        }).join('');

        return (
        '<aside class="sidebar">' +
            '<div class="sidebar-header">' +
            '<div class="logo">' +
                '<span class="logo-name">' + escapeHTML(CONFIG.name) + '</span>' +
                '<span class="logo-subtitle">' + escapeHTML(CONFIG.subtitle) + '</span>' +
            '</div>' +
            '</div>' +
            '<ul class="nav-list">' + items + '</ul>' +
        '</aside>'
        );
    }

    function mount() {
        if (document.getElementById(HOST_ID)) return; // don't inject twice

        var host = document.createElement('div');
        host.id = HOST_ID;

        var shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<style>' + SIDEBAR_CSS + '</style>' + buildMarkup();

        document.body.insertBefore(host, document.body.firstChild);

        if (applyOffset) {
        var style = document.createElement('style');
        style.id = HOST_ID + '-page-style';
        style.textContent = PAGE_CSS;
        document.head.appendChild(style);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
    })();
