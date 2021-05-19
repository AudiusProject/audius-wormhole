const solanaWeb3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const BufferLayout = require("buffer-layout");
const BN = require("bn.js");

function padBuffer(b, len) {
    const zeroPad = Buffer.alloc(len);
    b.copy(zeroPad, len - b.length);
    return zeroPad;
}

const publicKey = (property = 'publicKey') => {
    const publicKeyLayout = BufferLayout.blob(32, property);
  
    const _decode = publicKeyLayout.decode.bind(publicKeyLayout);
    const _encode = publicKeyLayout.encode.bind(publicKeyLayout);
  
    publicKeyLayout.decode = (buffer, offset) => {
      const data = _decode(buffer, offset);
      return new PublicKey(data);
    };
  
    publicKeyLayout.encode = (key, buffer, offset) => {
      return _encode(key.toBuffer(), buffer, offset);
    };
  
    return publicKeyLayout;
  };

class u64 extends BN {
  /**
   * Convert to Buffer representation
   */
  toBuffer() {
    const a = super.toArray().reverse();
    const b = Buffer.from(a);
    if (b.length === 8) {
      return b;
    }
    // assert(b.length < 8, "u64 too large");

    const zeroPad = Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }

  /**
   * Construct a u64 from Buffer representation
   */
  static fromBuffer(buffer) {
    // assert(buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
    return new u64(
      [...buffer]
        .reverse()
        .map((i) => `00${i.toString(16)}`.slice(-2))
        .join(""),
      16
    );
  }
}

const solanaConnection = new solanaWeb3.Connection("https://api.mainnet-beta.solana.com");

const wormholeAddress = new solanaWeb3.PublicKey("WormT3McKhFJ2RkiGpdw9GKvNCrB2aB54gb2uV9MfQC");
const delegatePubKey = new solanaWeb3.PublicKey("9zyPU1mjgzaVyQsYwKJJ7AhVz5bgx5uc1NPABvAcUXsT");
const tokenAddress = new solanaWeb3.PublicKey("CYzPVv1zB9RH6hRWRKprFoepdD8Y7Q5HefCqrybvetja");
const assetAddress = Buffer.from("18aAA7115705e8be94bfFEBDE57Af9BFc265B998", "hex")

// user specific
const tokenPubKey = new solanaWeb3.PublicKey("GM9GzLXavHCnkRjkkdALd9Ttmgt6E74D72VaTy2jkW2L");
const ownerAccount = new solanaWeb3.Account([]);
const targetAddress = Buffer.from("E6CF5b674aE59cE2e6C46D054a1f2df00178577c", "hex");
const amount = new u64(1000);


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchSignatureStatus = async (signatureStatus) => {
  let signatureInfo = await solanaConnection.getAccountInfo(
    signatureStatus,
    'single',
  );
  if (signatureInfo == null || signatureInfo.lamports == 0) {
    throw new Error('not found');
  } else {
    const dataLayout = BufferLayout.struct([
      BufferLayout.blob(20 * 65, 'signaturesRaw'),
    ]);
    let rawSignatureInfo = dataLayout.decode(signatureInfo.data);

    let signatures = [];
    for (let i = 0; i < 20; i++) {
      let data = rawSignatureInfo.signaturesRaw.slice(65 * i, 65 * (i + 1));
      let empty = true;
      for (let v of data) {
        if (v != 0) {
          empty = false;
          break;
        }
      }
      if (empty) continue;

      signatures.push({
        signature: data,
        index: i,
      });
    }

    return signatures;
  }
}

function uint256(property = "uint256") {
  return BufferLayout.blob(32, property);
}

async function getBridgeTransferFee() {
  return ((await solanaConnection.getMinimumBalanceForRentExemption((40 + 1340) * 2)) + 18 * 10000 * 2);
}

async function createLockAssetInstruction(nonce) {
  const lockAssetDataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    uint256("amount"),
    BufferLayout.u8("targetChain"),
    BufferLayout.blob(32, "assetAddress"),
    BufferLayout.u8("assetChain"),
    BufferLayout.u8("assetDecimals"),
    BufferLayout.blob(32, "targetAddress"),
    BufferLayout.seq(BufferLayout.u8(), 1),
    BufferLayout.u32("nonce"),
  ]);

  const TransferOutProposalLayout = BufferLayout.struct([
    BufferLayout.blob(32, 'amount'),
    BufferLayout.u8('toChain'),
    publicKey('sourceAddress'),
    BufferLayout.blob(32, 'targetAddress'),
    BufferLayout.blob(32, 'assetAddress'),
    BufferLayout.u8('assetChain'),
    BufferLayout.u8('assetDecimals'),
    BufferLayout.seq(BufferLayout.u8(), 1), // 4 byte alignment because a u32 is following
    BufferLayout.u32('nonce'),
    BufferLayout.blob(1001, 'vaa'),
    BufferLayout.seq(BufferLayout.u8(), 3), // 4 byte alignment because a u32 is following
    BufferLayout.u32('vaaTime'),
    BufferLayout.u32('lockupTime'),
    BufferLayout.u8('pokeCounter'),
    publicKey('signatureAccount'),
    BufferLayout.u8('initialized'),
    BufferLayout.seq(BufferLayout.u8(), 2), // 2 byte alignment
  ]);

  const nonceBuffer = Buffer.alloc(4);
  nonceBuffer.writeUInt32LE(nonce, 0);

  const seeds = [
    Buffer.from("transfer"),
    delegatePubKey.toBuffer(),
    Buffer.from([2]),
    // padBuffer(tokenAddress.toBuffer(), 32),
    padBuffer(assetAddress, 32),
    Buffer.from([2]),
    padBuffer(targetAddress, 32),
    tokenPubKey.toBuffer(),
    nonceBuffer,
  ];

  const transferKey = (
    await solanaWeb3.PublicKey.findProgramAddress(seeds, wormholeAddress)
  )[0];

  const data = Buffer.alloc(lockAssetDataLayout.span);
  lockAssetDataLayout.encode(
    {
      instruction: 1, // TransferOut instruction
      amount: padBuffer(Buffer.from(amount.toArray()), 32),
      targetChain: 2,
      // assetAddress: padBuffer(tokenAddress.toBuffer(), 32),
      assetAddress: padBuffer(assetAddress, 32),
      assetChain: 2,
      assetDecimals: 9,
      targetAddress: padBuffer(targetAddress, 32),
      nonce: nonce,
    },
    data
  );

  const keys = [
    {pubkey: wormholeAddress, isSigner: false, isWritable: false},
    {pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false},
    {pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
    {pubkey: solanaWeb3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
    {pubkey: solanaWeb3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false},
    {pubkey: solanaWeb3.SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false},
    {pubkey: tokenPubKey, isSigner: false, isWritable: true},
    {pubkey: delegatePubKey, isSigner: false, isWritable: false},

    {pubkey: transferKey, isSigner: false, isWritable: true},
    {pubkey: tokenAddress, isSigner: false, isWritable: true},
    {pubkey: ownerAccount.publicKey, isSigner: true, isWritable: true},
  ];

  return {
    ix: new solanaWeb3.TransactionInstruction({
      keys,
      programId: wormholeAddress,
      data,
    }),
    transferKey
  }
}

async function main() {
  const token = new spl.Token(
    solanaConnection,
    tokenAddress,
    spl.TOKEN_PROGRAM_ID,
    ownerAccount
  );

  const approveInstruction = spl.Token.createApproveInstruction(
    spl.TOKEN_PROGRAM_ID,
    tokenPubKey,
    delegatePubKey,
    ownerAccount.publicKey,
    [],
    amount,
  );

  const transferFeeInstruction = solanaWeb3.SystemProgram.transfer({
    fromPubkey: ownerAccount.publicKey,
    toPubkey: delegatePubKey,
    lamports: await getBridgeTransferFee(),
  });

  const {
    ix: lockAssetInstruction,
    transferKey,
  } = await createLockAssetInstruction(Math.random() * 10000);

  const transaction = new solanaWeb3.Transaction();
  transaction.add(approveInstruction);
  transaction.add(transferFeeInstruction);
  transaction.add(lockAssetInstruction);

  const signature = await solanaWeb3.sendAndConfirmTransaction(
    solanaConnection,
    transaction,
    [ownerAccount]
  );

  console.log("Signature:", signature);
  console.log("Transfer key:", transferKey.toBase58())

  const listener = solanaConnection.onAccountChange(
    transferKey,
    async (a) => {
      let lockup = TransferOutProposalLayout.decode(a.data);
      let vaa = lockup.vaa;

      for (let i = vaa.length; i > 0; i--) {
        if (vaa[i] == 0xff) {
          vaa = vaa.slice(0, i);
          break;
        }
      }

      if (vaa.filter((v) => v !== 0).length == 0) {
        return;
      }

      solanaConnection.removeAccountChangeListener(accountChangeListener);
      solanaConnection.removeSlotChangeListener(slotUpdateListener);

      let signatures;
      while (!signatures) {
        try {
          signatures = await bridge.fetchSignatureStatus(
            lockup.signatureAccount,
          );
          break;
        } catch {
          await sleep(500);
        }
      }

      let sigData = Buffer.of(
        ...signatures.reduce((previousValue, currentValue) => {
          previousValue.push(currentValue.index);
          previousValue.push(...currentValue.signature);

          return previousValue;
        }, new Array()),
      );

      vaa = Buffer.concat([
        vaa.slice(0, 5),
        Buffer.of(signatures.length),
        sigData,
        vaa.slice(6),
      ]);

      console.log("vaa", vaa.toString("hex"))
    }
  )
}

main();
