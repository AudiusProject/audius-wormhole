const Web3 = require('web3')
const solanaWeb3 = require('@solana/web3.js')
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token')

const wormholeABI = require('./wormholeABI.json')
const tokenABI = require('./tokenABI.json')

const solanaConnection = new solanaWeb3.Connection(
  'https://api.mainnet-beta.solana.com'
)
const web3 = new Web3(
  'https://mainnet.infura.io/v3/'
) // insert infura endpoint

const publicKey = new solanaWeb3.PublicKey(
  '9zyPU1mjgzaVyQsYwKJJ7AhVz5bgx5uc1NPABvAcUXsT'
)
const owner = new solanaWeb3.PublicKey('')
const payer = new solanaWeb3.Account([])

const ethAccount = web3.eth.accounts.wallet.add('')
const ethTokenContract = new web3.eth.Contract(
  tokenABI,
  '0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998'
)
const wormholeContract = new web3.eth.Contract(
  wormholeABI,
  '0xf92cD566Ea4864356C5491c177A430C222d7e678'
)

const amount = 100000000

async function getGasPrice() {
  try {
    const gasPrices = await axios.get(
      'https://ethgasstation.info/json/ethgasAPI.json'
    )
    return web3.utils.toWei((gasPrices.data.fastest / 10).toString(), 'gwei')
  } catch (err) {
    console.error(
      `Got ${err} when trying to fetch gas from ethgasstation.info, falling back web3's gas estimation`
    )
    return (await web3.eth.getGasPrice()).toString()
  }
}

async function main() {
  const token = new Token(solanaConnection, publicKey, TOKEN_PROGRAM_ID, payer)
  const solanaAccount = await token.createAccount(owner)
  const solanaAccountHex = solanaAccount.toBuffer().toString('hex')

  await ethTokenContract
    .approve(wormholeContract.options.address, amount)
    .send({
      from: ethAccount.address,
      gas: 100000,
      gasPrice: await getGasPrice()
    })

  await wormholeContract.methods
    .lockAssets(
      ethTokenContract.options.address,
      amount,
      solanaAccountHex,
      1,
      123
    )
    .send({
      from: ethAccount.address,
      gas: 200000,
      gasPrice: await getGasPrice()
    })
}

main()
