const fs = require('fs');
const jsdom = require('jsdom');
const code = fs.readFileSync('m.js', 'utf8');
const dom = new jsdom.JSDOM('<script>' + code + '</script>', { runScripts: 'dangerously' });
const keys = Object.keys(dom.window).filter(k => k.toLowerCase().includes('mjml'));
console.log('MJML keys:', keys);
if (keys.includes('mjml')) {
    console.log('Type of window.mjml:', typeof dom.window.mjml);
    console.log('Keys of window.mjml:', Object.keys(dom.window.mjml));
}
