/**
 * Chainlink Functions 脚本
 * 职责: 从我们的后端API中获取特定市场的裁决结果，并将其返回。
 * 如何运行和测试:
 * 1. 在本地，可以使用 `npx @chainlink/functions-toolkit@latest sim` 命令进行模拟。
 * 2. 在线上，可以将此脚本上传到 Chainlink Functions UI
 */

// 检查 `args` 数组是否包含了我们需要的参数
// 我们期望在调用此 Function 时，从智能合约传入市场所在的地址
if(!args[0]) {
    throw new Error("错误: 必须在 args[0] 中提供市场合约的地址");
}

const marketAddress = args[0];

// 构建我们后端 API 的 URL。
// 在真实部署中，这里应该是你的公开服务器地址，而不是localhost。
const apiURL = `https://backend-5z8l.onrender.com/get-resolution/${marketAddress}`;

console.log(`正在向 API 发起请求: ${apiURL}`);

// 使用 Chainlink Functions 提供的 `Functions.makeHttpRequest` 来发送 API 请求
// 这是官方推荐的，在 Functions 沙盒环境中发起网络请求的方式

const apiResponse = await Functions.makeHttpRequest({
    url: apiURL,
    method: "GET",
    // 我们可以设置超时时间，以防API响应过度
    timeout: 5000,
});

// 检查 API 请求是否出错
if (apiResponse.error) {
    console.error("API 请求错误:", apiResponse.response.data);
    throw new Error(`API 请求失败: ${apiResponse.response.data}`);
}

//从响应中获取数据
const responseData = apiResponse.data;

// 验证响应数据是否包含了我们需要的 winningOptionIndex。
if (responseData.winningOptionIndex === undefined) {
    throw new Error("API 响应中未找到 'winningOptionIndex'");
}

const winningOptionIndex = responseData.winningOptionIndex;
console.log(`从 API 获取的获胜选项索引为: ${winningOptionIndex}`);


// 最关键的一步: 将获取到的数字编码为 Solidity 能理解的 bytes 格式。
// `Functions.encodeUint256` 会将一个 JavaScript 数字转换为一个 bytes32 的值
// 我们的 PredictionMarket 合约接收到这个 bytes 值后， 会自动将其解码为 uint256
const encodedResult = Functions.encodeUint256(winningOptionIndex);


// 返回编码后的结果
return encodedResult;