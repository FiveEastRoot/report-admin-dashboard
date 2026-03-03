// netlify/functions/gas-proxy.js
// GAS CORS 우회 프록시: 브라우저 → 이 함수 → GAS (서버-서버 통신)

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzq6PI_nyOrna4HBYekghzkjwg8fUbm35nuT8sOEiLtgeqJ2rfOcVensvHXBQm6tBkv/exec';

exports.handler = async (event) => {
    // CORS preflight (OPTIONS) 처리
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const gasRes = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: event.body,
            redirect: 'follow',
        });

        const text = await gasRes.text();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: text,
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: err.message }),
        };
    }
};
