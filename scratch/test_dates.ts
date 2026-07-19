import { parseDateOnlyUTC } from '../utils/dateHelpers';

console.log("parseDateOnlyUTC('invalid'):", parseDateOnlyUTC('invalid'));
console.log("parseDateOnlyUTC('invalid').getTime():", parseDateOnlyUTC('invalid').getTime());
