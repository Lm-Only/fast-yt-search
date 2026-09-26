import assert from 'node:assert/strict';
import { yts } from './dist/index.js';

async function run() {
    const query = process.env.YTS_TEST_QUERY || 'lofi hip hop';
    const result = await yts(query);

    assert.ok(result, 'yts() deve retornar um objeto');
    assert.ok(Array.isArray(result.all), 'result.all deve ser um array');
    assert.ok(result.all.length > 0, 'result.all deve conter ao menos 1 item');

    const first = result.all[0];
    assert.equal(first.type, 'video', 'item.type deve ser "video"');
    assert.equal(typeof first.videoId, 'string', 'item.videoId deve ser string');
    assert.ok(first.videoId.length > 0, 'item.videoId não pode ser vazio');
    assert.equal(typeof first.title, 'string', 'item.title deve ser string');
    assert.equal(typeof first.url, 'string', 'item.url deve ser string');
    assert.ok(first.url.startsWith('https://www.youtube.com/watch?v='), 'item.url deve ser URL do YouTube');

    console.log('OK: teste de integração passou');
    console.log(`Query: "${query}" | Resultados: ${result.all.length}`);
}

run().catch((error) => {
    console.error('FALHA NO TESTE:', error?.message || error);
    process.exitCode = 1;
});
