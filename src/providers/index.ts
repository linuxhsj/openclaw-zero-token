// 在现有的 providers/index.ts 中添加
import { mimoWebProvider } from "./mimo-web";

// 添加到 providers 列表
export const providers = {
  // ... 现有的 providers
  "mimo-web": mimoWebProvider,
};

// 或者如果是数组形式
export const providerList = [
  // ... 现有的 providers
  mimoWebProvider,
];
