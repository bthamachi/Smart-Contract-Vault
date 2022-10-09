import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HamachiToken, HamachiToken__factory, VestingVault, VestingVault__factory } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";

const totalSupply = (10 ** 9).toString()

describe("Vesting Vault", function () {

    let HamachiToken: HamachiToken;
    let VestingVault: VestingVault;
    let owner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress
    let addrs: SignerWithAddress[];

    let beneficiary: SignerWithAddress;

    beforeEach(async function () {

        // Provision Addresses first
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();



        // Create Contract Interfaces
        const HamachiTokenFactory: HamachiToken__factory = await ethers.getContractFactory("HamachiToken", owner)
        const VestingVaultFactory: VestingVault__factory = await ethers.getContractFactory("VestingVault", owner);

        //Set Constants

        beneficiary = addr1

        //Deploy Contracts
        HamachiToken = await HamachiTokenFactory.deploy(ethers.utils.parseEther(totalSupply))
        VestingVault = await VestingVaultFactory.deploy(beneficiary.address)
    });

    describe("Deployment", function () {
        it("should be initialised with a set beneficiary", async function () {
            expect(await VestingVault.beneficiary()).to.equal(beneficiary.address)
            expect(await VestingVault.funded()).to.equal(false)
        })

        it("should throw an error when withdraw is called when initialised", async function () {
            await expect(VestingVault.withdraw()).to.be.revertedWith("Vesting Vault has not been funded, please try again later")
        })

        it("should be owned by the person who deployed the contract", async function () {
            expect(await VestingVault.owner()).to.be.equal(owner.address)
        })
    })

    describe("Funding", function () {
        // Input Checks
        it("Should throw an error if owner sets a vesting duration of 0", async function () {
            await expect(VestingVault.fund(0, HamachiToken.address, 1000)).to.be.revertedWith("Vesting Duration needs to be non-zero!")
        })

        it("Should throw an error if owner provides an invalid ERC-20 token address", async function () {
            await expect(VestingVault.fund(40, addr1.address, 1000)).to.be.reverted
        })


        // Functionality Checks
        it("should be funded with a set number amount of ERC-20 tokens", async function () {
            const vestingDuration = (10 ** 4) //this is in seconds
            const fundedAmount = 1000

            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)
            const addressBalance = await HamachiToken.balanceOf(VestingVault.address)
            expect(addressBalance).to.be.equal(fundedAmount)
            expect(await VestingVault.funded()).to.be.true
            expect(await VestingVault.vestingVaultValue()).to.be.equal(fundedAmount)
        })

        it("should support funding for Eth", async function () {
            const vestingDuration = (10 ** 4) //this is in seconds
            const fundedAmount = 1000

            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount, { from: owner.address, value: 1 })
            const addressBalance = await HamachiToken.balanceOf(VestingVault.address)
            expect(addressBalance).to.be.equal(fundedAmount)
            expect(await VestingVault.funded()).to.be.true
            expect(await VestingVault.vestingVaultValue()).to.be.equal(fundedAmount)
            expect(await VestingVault.provider.getBalance(VestingVault.address)).to.be.equal(1)
        })

    })
    describe("Withdrawal for pure ERC-20 Withdrawals", function () {
        it("should be disabled once the user blacklisted", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)
            await VestingVault.blacklistBeneficiary();
            await expect(VestingVault.connect(beneficiary).withdraw()).to.be.revertedWith("Owner has prematurely cancelled vesting and prohibited beneficiary from recieving funds")
        })

        it("should not able to call withdrawal before the vault is funded", async function () {
            await expect(VestingVault.withdraw()).to.be.revertedWith("Vesting Vault has not been funded, please try again later")
        })

        it("should only allow the beneficiary to call the contract", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)

            await expect(VestingVault.connect(addr2).withdraw()).to.be.revertedWith("Only beneficiary can withdraw money from this contract")
        })
        it("Should prohibit beneficiary from being able to call withdrawal if not yet till unlock time", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)

            await expect(VestingVault.connect(beneficiary).withdraw()).to.be.revertedWith("Vesting duration has not been completed, please try again later")
        })

        it("should prohibit beneficiary from being able to call withdrawl if the owner of the contract has blacklisted the beneficiary", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)


            // Check that Owner gets back all his original ERC20 tokens
            expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(fundedAmount)
            await VestingVault.blacklistBeneficiary()
            expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0)
            expect(await HamachiToken.balanceOf(owner.address)).to.be.equal(ethers.utils.parseEther(totalSupply))

            // Ensure that beneficiary is unable to call
            await expect(VestingVault.connect(beneficiary).withdraw()).to.be.revertedWith("Owner has prematurely cancelled vesting and prohibited beneficiary from recieving funds")


        })

        it("should only allow beneficiary to call withdrawal once. Subsequent attempts should throw an error", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)

            await time.increase(vestingDuration);
            await VestingVault.connect(beneficiary).withdraw()
            expect(await HamachiToken.balanceOf(beneficiary.address)).to.be.equal(fundedAmount);
            expect(expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0));

            await expect(VestingVault.connect(beneficiary).withdraw()).to.be.revertedWith(
                "Vault's vested tokens have already been redeemed"
            )
        })


        it("should allow beneficiary to call withdrawl and call his ERC-20 if the exact amount of unlock time has passed", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)

            await time.increase(vestingDuration);
            await VestingVault.connect(beneficiary).withdraw()
            expect(await HamachiToken.balanceOf(beneficiary.address)).to.be.equal(fundedAmount);
            expect(expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0));
        })
        it("should allow beneficiary to call withdrawl and recieve his ERC-20 if more time than the specified unlock time has passed", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount)

            await time.increase(vestingDuration * 2);
            await VestingVault.connect(beneficiary).withdraw()
            expect(await HamachiToken.balanceOf(beneficiary.address)).to.be.equal(fundedAmount);
            expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0);
        })

    })


    describe("Withdrawals tests for Eth AND Erc-20", async function () {
        it("should refund the owner all his eth and erc20 tokens in the event that blacklist is called before unlock time has passed", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            const transferedAmountOfEth = ethers.utils.parseEther("1");


            await HamachiToken.approve(VestingVault.address, fundedAmount)
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount, { from: owner.address, value: transferedAmountOfEth })
            const originalAmount = await owner.getBalance()
            await VestingVault.blacklistBeneficiary()
            //Owner should get his eth and erc20 tokens back
            expect(await owner.getBalance()).to.be.greaterThanOrEqual(originalAmount);
            expect(await VestingVault.provider.getBalance(VestingVault.address)).to.be.equal(0);
            expect(await HamachiToken.balanceOf(owner.address)).to.be.equal(ethers.utils.parseEther(totalSupply));
            expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0);

            // //Beneficiary should not be able to call withdrawal
            await expect(VestingVault.connect(beneficiary).withdraw()).to.be.revertedWith("Owner has prematurely cancelled vesting and prohibited beneficiary from recieving funds")
        })

        it("should allow beneficiary to call withdrawal and recieve his ERC-20 tokens and ETH once unlock time has passed", async function () {
            const vestingDuration = (10 ** 4);
            const fundedAmount = 1000;
            const transferedAmountOfEth = ethers.utils.parseEther("1");
            const originalRecipientBalance = await beneficiary.provider?.getBalance(beneficiary.address)

            await HamachiToken.approve(VestingVault.address, fundedAmount);
            await VestingVault.fund(vestingDuration, HamachiToken.address, fundedAmount, { from: owner.address, value: transferedAmountOfEth, gasPrice:  });
            expect(await VestingVault.provider.getBalance(VestingVault.address)).to.be.equal(transferedAmountOfEth)

            await time.increase(vestingDuration);
            await VestingVault.connect(beneficiary).withdraw()

            expect(await HamachiToken.balanceOf(beneficiary.address)).to.be.equal(fundedAmount);
            expect(await HamachiToken.balanceOf(VestingVault.address)).to.be.equal(0);
            expect(await VestingVault.provider.getBalance(VestingVault.address)).to.be.equal(0);
            // Ensure eth was transfered over minus gas fees
            expect(await VestingVault.provider.getBalance(beneficiary.address)).to.be.greaterThan(originalRecipientBalance)
        })
    })



})