export const searchTrigger = /(\u641c\u7d22|\u67e5\u4e00\u4e0b|\u5e2e\u6211\u67e5|\u5e2e\u6211\u641c|\u8054\u7f51|\u767e\u5ea6\u4e00\u4e0b|bing|Bing|\u6700\u65b0|\u65b0\u95fb|\u4eca\u5929|\u73b0\u5728\u662f\u4ec0\u4e48|\u5929\u6c14|\u70ed\u641c|\u53d1\u751f\u4e86\u4ec0\u4e48)/u
export function explicitlyNeedsSearch(prompt) { return searchTrigger.test(String(prompt)) }
