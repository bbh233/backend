// ====================================================
// 1. 引入依赖
// ====================================================

// require('dotenv').config()会读取项目根目录下的 .env 文件，
// 并将其中定义的变量加载到 Node.js 的 process.env 对象中
// 这让我们可以安全的管理敏感信息，而无需将其硬编码到代码里
require('dotenv').config();

// express 是一个极简且灵活的 Node.js Web 应用程序框架
// 我们用它快速搭建 API 服务器，定义路由（接口） 等
const express = require('express');

// ethers.js 是一个功能强大的库，用于与以太坊区块链进行交互
// 我们用它来连接到节点，读取智能合约的数据
const { ethers } = require('ethers');

// ====================================================
// 2.初始化应用和配置
// ====================================================

// 创建一个 Express 应用实例
const app = express();  

// app.use(express.json()) 是一个中间件（Middleware)
// 它的作用是解析传入请求的请求体， 如果请求体是 JSON 格式
// 它会将其转换为 javaScript 对象， 方便我们在后续的接口中直接使用 req.body
app.use(express.json());

// 从 .evn 文件中读取配置, 如果 .env 中没有定义，则使用默认值
const PORT = process.env.PORT;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const API_KEY = process.env.API_KEY;

// ====================================================
// 3.初始化与以太坊的连接
// ====================================================

// 检查 .env 文件中是否配置 RPC URL， 如果没有，则中止程序，防止后续出错
if (!SEPOLIA_RPC_URL) {
    console.error("错误: 请在 .env 文件中配置 SEPOLIA_RPC_URL");
    // 退出程序，状态码1表示异常退出
    process.exit(1)
}

// 创建一个 Provider 实例。 provider 是 ethers.js 中与以太坊建立只读连接的抽象
// 透过这个 provider, 我们可以查询区块链数据，但不能发送交易（因为没有私钥）
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

// ABI 合约的结构体描述，同时规定了数据编码/解码的规则
// ethers.js 需要 ABI 才能知道如何编码和解码数据，以便正确地调用合约函数
const predictionMarketAbi = [
    "function options(uint256) view returns (bytes32 name, uint256 totalPool)",
    "function totalPool() view returns (uint256)",
    "function isResolved() view returns (bool)",
    "functionn winningOptionIndex() view returns (uint256)"
];


// 这是一个临时的，用于存储裁决结果的内存对象。
// 键（key）是小写的市场合约地址，值（value)是获胜选项的索引。
// 对于黑客松或MVP阶段，这是一个简单高效的方案
// 缺点:如果服务器重启，所有数据都会丢失
// 生产环境中,应替换为持久化数据库（如Redis, PostgreSQL)
const resolutionStore = {};


// ====================================================
// 4.定义中间件
// ====================================================

// 中间件是 Express 框架中的一个核心概念,它是一个函数
// 可以在请求到达最终的路由处理函数之前，对请求进行预处理
// 我们用它来实现身份验证、日志记录等功能
const apiKeyMiddleware = (req, res, next) => {
    // 从请求头(headers) 中获取名为 'x-api-key' 的值
    const providedApiKey = req.headers['x-api-key'];

    // 验证 API Key是否存在且与 .env 文件中配置的一致
    if(!providedApiKey || providedApiKey != API_KEY) {
        // 如果验证失败, 理解返回 401 Unauthorized 错误，并终止请求链
        return res.status(401).json({ error: '未授权: 无效的 API Key'});
    }

    // 如果验证成功, 调用 next()函数吗，将请求传送给下一个中间件或路由处理函数
    next();
}

// ====================================================
// 5.定义核心接口
// ====================================================
/**
 * @route GET /metadata/:contractAddress/:tokenId
 * @description 动态生成并返回 dNFT 的元数据。 这是一个公开接口
 * :contractAddress 和 :tokenId 是动态路由数据， 可以从 req.params 中获取
 */

app.get('/metadata/:contractAddress/:tokenId', async (req, res) => {
    try {
        const { contractAddress, tokenId} = req.params;
        
        // 使用合约地址、 ABI 和 provider，创建一个可与链上交互的本地实例.
        const marketContract = new ethers.Contract(contractAddress, predictionMarketAbi);

        // --- 从区块链异步读取实时数据 ---
        // 所有的合约调用都是异步的, 因此必须使用 await
        const option0 = await marketContract.options(0);
        const option1 = await marketContract.options(1);
        const totalPool = await marketContract.totalPool();
        const isResolved = await marketContract.isResolved();

        // --- 核心动态逻辑: 根据链上数据决定元数据内容 ---
        let odds = 50;  // 如果资金池为0, 默认赔率为50%

        if(totalPool > 0) {
            // 计算选项0的胜率 (赔率)
            // 注意: ethers v6 返回的是 BigInt类型，为了防止精度丢失
            // 我们在计算时候也使用 BigInt （100n)
            // 最后用 Number() 将结果转换为普通数字一遍后续比较和格式化
            odds = Number((option0.totalPool * 100n) / totalPool) ;
        }

        // 预先生成并上传到IPFS的图片URL
        // 在这里填入你真实的IPFS CID (Content Identifier)。
        const imageUrls = {
            initial:"bafybeihnupuikrn6zwq7aozfmtw7eppqf4hhrasyo2lpari7arz27i6pqq",
            slight_advantage:"bafybeihnupuikrn6zwq7aozfmtw7eppqf4hhrasyo2lpari7arz27i6pqq",
            huge_advantage:"bafybeiecjtvd4xxlyjlr2uagy2ermnkfyfhgbdzhqrp4coflmwef33o6pm",
            win:"bafybeigeswyw24exdy5r4hvx2zg3yvfprcazhja5aowqwlvejeviizoomm",
            slight_disadvantage:"bafybeihyqd3sltgm72vcn2mbd2tcm64qqxtmnm232a5rujnonox7j4w77q",
            huge_disadvantage:"bafybeifubqeukm7q5fd5wxulstptokvbrq3jmdho6em5rh6kk4vi6mod2y",
            loss:"bafybeihiaeifcob2wsqc5tqg6ae3voc5wzfuhp7pf2ln56t3njibbjhgkq"
        }

        let currentImage = imageUrls.initial;
        let resultAttribute = {"trait_type" : "Result", "value": "Pending"};

        if (isResolved) {
            // 如果市场已结算, 根据最终结果选择图片
            // 这里有一个待解决的逻辑: 我们需要知道这个 tokenId 是属于哪个选项的投注者
            // 在一个完整的应用中, 你可能需要一个额外的数据库来记录tokenId
            // 或者在链上NFT合约中存储这个信息
            // 为了MVP，我们暂时假设所有请求都想看选项0的结果视角
            const winningIndex = await marketContract.winningOptionIndex();
            if (winningIndex === 0n) {
                currentImage = imageUrls.win;
                resultAttribute.value = "Won";
            } else {
                currentImage = imageUrls.loss;
                resultAttribute.value = "Lost";
            } 
        } else {
            // 如果市场未结算，根据事实赔率选择图片。
            if (odds > 75) currentImage = imageUrls.huge_advantage;
            else if (odds > 55) currentImage = imageUrls.slight_advantage;
            else if (odds < 25) currentImage = imageUrls.huge_disadvantage;
            else if (odds < 45) currentImage = imageUrls.slight_disadvantage;
        }

        // 构建符合OpenSea 元数据标准的 JSON 对象。
        const metadata = {
            name : `Prediction Market Position #${tokenId}`,
            describe: "A dynamic NFT representing a position in a dBet prediction",
            image: currentImage,
            attributes: [
                { "trait_type": "Odds (Option 0)", "value": `${odds.toFixed(2)}%`}
            ]
        };
        
        // 将构建好的JSON对象作为响应返回
        res.json(metadata);

    }   catch (error) {
            console.error("元数据获取失败:", error);
            res.status(500).json({error:'获取元数据失败。'});
    }
});

/**
 * @route POST /resolve-market
 * @description (受保护) 接受并存储市场裁决结果
 * 第二个参数 apiKeyMiddleware 制定了这个接口在执行前必须通过API Key验证
 */

app.post('/resolve-market', apiKeyMiddleware, (req, res) => {
    // 从解析后的请求体中获取数据
    const { marketAddress, winningOptionIndex } = req.body;

    // 基础的输入验证
    if(!marketAddress || winningOptionIndex === undefined) {
        return res.status(400).json({ error: 'marketAddress 和 winningnOptionIndex是不合法的'})
    }

    // 将结果存储在我们的临时内存对象中
    // 使用 .toLowerCase() 确保地址格式一致，避免大小写问题
    resolutionStore[marketAddress.toLowerCase()] = winningOptionIndex;

    console.log(`已存储裁决结果 - 市场: ${marketAddress}, 获胜方: 选项 ${winningOptionIndex}`);
    res.status(200).json({
        message: '裁决结果已成功存储.',
        market: marketAddress,
        winner: winningOptionIndex
    });
});


/**
 * @route GET /get-resolution/:marketAddress
 * @description(公开) Chainlink Functions 将从此接口获取结果.
 * 这个接口设计得尽可能简单和无状态，只负责读取和返回数据
 */

app.get('/get-resolution/:marketAddress', (req, res) => {
    const {marketAddress} = req.params;
    const winningOptionIndex = resolutionStore[marketAddress.toLowerCase()];

    // 如果内存中没有找到对应市场的结果，返回 404 Not Found.
    if (winningOptionIndex === undefined) {
        return res.status(404).json({ error: "未找到该市场的裁决结果."});
    }

    // 将结果以JSON格式返回
    res.json({ winningOptionIndex});
});


// ====================================================
// 6. 启动服务器
// ====================================================
app.listen(PORT, () => {
    console.log(`dBet 后端服务器已启动, 监听端口: ${PORT}`);
    
    //为了方便开发, 在启动时打印API Key: ${API_KEY}
    if(API_KEY){
        console.log(`受保护接口的 API Key: ${API_KEY}`);
    } else {
        console.warn("警告: 未在 .env 文件中设置 API_KEY。");
    }
});