export default {
    async fetch(request, env) {
        // 1. CORS Preflight 처리
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*', // 필요시 대시보드 URL(Netlify 주소)로 제한 가능
                    'Access-Control-Allow-Methods': 'PUT, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // 2. 파일 업로드 처리 (POST 전용)
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        try {
            // 폼 데이터 파싱
            const formData = await request.formData();
            const file = formData.get('file');

            if (!file) {
                return new Response(JSON.stringify({ error: 'No file provided' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
            }

            // 3. 파일 이름(난수화) 및 경로 설정
            const fileExt = file.name.split('.').pop();
            const fileName = `reports/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

            // 4. R2 버킷에 파일 저장
            // *주의: env.MY_BUCKET 이름은 Worker 설정 시 바인딩한 변수 이름과 동일해야 합니다.
            await env.MY_BUCKET.put(fileName, await file.arrayBuffer(), {
                httpMetadata: { contentType: file.type }
            });

            // 5. R2 커스텀 도메인(공용 URL) 반환
            // *주의: 발급받은 본인의 R2 공용 도메인으로 변경해야 합니다.
            const publicUrl = `https://pub-bf359da32713477cade8c5c3a5a94e41.r2.dev/${fileName}`;

            return new Response(JSON.stringify({ success: true, url: publicUrl }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }
    }
};
