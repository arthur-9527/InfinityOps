/**
 * 测试Ctrl+C中断功能的无限循环脚本
 * 该脚本会每秒打印一次计数，直到被Ctrl+C中断
 */

console.log('Ctrl+C测试脚本已启动');
console.log('这个脚本将每秒打印一个计数，直到被Ctrl+C中断');
console.log('请按Ctrl+C来测试中断功能');

let counter = 0;

// 注册SIGINT处理程序
process.on('SIGINT', () => {
  console.log('\n收到SIGINT信号 (Ctrl+C)');
  console.log('脚本将正常退出');
  process.exit(0);
});

// 每秒递增计数器
setInterval(() => {
  counter++;
  process.stdout.write(`当前计数: ${counter}    \r`);
}, 1000);

// 脚本将持续运行直到被中断 