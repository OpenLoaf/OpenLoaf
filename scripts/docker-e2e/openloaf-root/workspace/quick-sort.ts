/**
 * 快速排序算法实现（升序）
 * @param arr 待排序的整数数组
 * @returns 排序后的数组
 */
function quickSort(arr: number[]): number[] {
  // 基线条件：数组长度小于等于1时直接返回
  if (arr.length <= 1) {
    return arr;
  }
  
  // 选择基准元素（这里选择中间元素）
  const pivot = arr[Math.floor(arr.length / 2)];
  const left: number[] = [];
  const right: number[] = [];
  const equal: number[] = [];
  
  // 将元素按与基准的大小关系分组
  for (const element of arr) {
    if (element < pivot) {
      left.push(element);
    } else if (element > pivot) {
      right.push(element);
    } else {
      equal.push(element);
    }
  }
  
  // 递归排序左右子数组，并合并结果
  return [...quickSort(left), ...equal, ...quickSort(right)];
}

// 测试用例
console.log('排序前: [3, 6, 2, 8, 1, 9]');
console.log('排序后: ', quickSort([3, 6, 2, 8, 1, 9])); // 输出: [1, 2, 3, 6, 8, 9]

console.log('\n排序前: [5, 5, 5]');
console.log('排序后: ', quickSort([5, 5, 5])); // 输出: [5, 5, 5]

console.log('\n排序前: []');
console.log('排序后: ', quickSort([])); // 输出: []

console.log('\n排序前: [42]');
console.log('排序后: ', quickSort([42])); // 输出: [42]