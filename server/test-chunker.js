const { chunkText } = require('./services/chunker.js');

// 测试 1：短文本不切
const short = '只有一句话。';
console.log('1. 短文本:', chunkText(short, { chunkSize: 200, overlap: 40 }));
// 期望: ['只有一句话。']

// 测试 2：空文本
console.log('2. 空文本:', chunkText('', { chunkSize: 200, overlap: 40 }));
// 期望: []

// 测试 3：纯英文
const en = 'The Composition API is a major upgrade to Vue 3. It solves the logic scattering problem in large components. The setup function is the entry point. You can use ref and reactive to create reactive data.';
const enChunks = chunkText(en, { chunkSize: 150, overlap: 30 });
console.log('3. 英文:', enChunks.length, '块');
enChunks.forEach((c, i) => console.log(`   [${i}] ${c.length}chars: ${c.slice(0, 60)}...`));

// 测试 4：长段无标点（兜底硬切）
const noPunct = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(20);
const hardChunks = chunkText(noPunct, { chunkSize: 50, overlap: 10 });
console.log('4. 无标点长串:', hardChunks.length, '块');
console.log('   最后一块:', hardChunks[hardChunks.length - 1].length, 'chars');
