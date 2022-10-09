//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "hardhat/console.sol";

contract VestingVault is Ownable {
    address payable public beneficiary;
    uint256 public unlockTime;
    uint256 public vestingVaultValue;
    bool public funded;
    bool vaultRedeemed;
    IERC20 token;
    bool vestingCancelled;

    /////////////////
    // Constructor //
    /////////////////
    constructor(address _beneficiary) {
        beneficiary = payable(_beneficiary);
    }

    /////////////////
    // Code        //
    /////////////////
    function fund(
        uint256 _vestingDuration,
        address ERC20Token,
        uint256 _tokenFunding
    ) public payable onlyOwner {
        require(_vestingDuration > 0, "Vesting Duration needs to be non-zero!");
        token = IERC20(ERC20Token);
        unlockTime = block.timestamp + _vestingDuration;

        //Check to make sure wallet can fund vault
        uint256 walletBalance = token.balanceOf(msg.sender);
        require(walletBalance >= _tokenFunding);

        //Transfer funded amount to contract;

        bool fundingSuccess = token.transferFrom(
            msg.sender,
            address(this),
            _tokenFunding
        );
        require(
            fundingSuccess,
            "Transfer from ERC20 Contract Failed. Please check your balance"
        );

        funded = true;
        vestingVaultValue = _tokenFunding;
    }

    // Tokens are immediately returned to the owner
    function blacklistBeneficiary() public onlyOwner {
        vestingCancelled = true;
        withdrawEth();
        withdrawERC20();
    }

    function withdrawEth() internal returns (bool) {
        if (address(this).balance == 0) {
            return true;
        }
        (bool sent, bytes memory data) = msg.sender.call{
            value: address(this).balance
        }("");
        return sent;
    }

    function withdrawERC20() internal returns (bool) {
        if (token.balanceOf(address(this)) == 0) {
            return true;
        }
        bool succesfulTokenTransfer = token.transfer(
            msg.sender,
            vestingVaultValue
        );
        return succesfulTokenTransfer;
    }

    function withdrawCurrentBalance() internal returns (bool) {
        bool succesfulEthTransfer = withdrawEth();
        bool succesfulErc20Transfer = withdrawERC20();

        require(succesfulErc20Transfer, "ERC20 Withdrawal failed");
        require(succesfulEthTransfer, "Eth Withdrawl failed, try again");
        return true;
    }

    function withdraw() public {
        require(
            funded,
            "Vesting Vault has not been funded, please try again later"
        );
        require(
            msg.sender == beneficiary,
            "Only beneficiary can withdraw money from this contract"
        );

        require(
            !vestingCancelled,
            "Owner has prematurely cancelled vesting and prohibited beneficiary from recieving funds"
        );
        require(
            !vaultRedeemed,
            "Vault's vested tokens have already been redeemed"
        );
        require(
            block.timestamp >= unlockTime,
            "Vesting duration has not been completed, please try again later"
        );
        require(!vaultRedeemed, "Vault has already been redeemed");

        // We transfer all our ERC-20 tokens and Eth to the beneficiary
        withdrawCurrentBalance();
        vaultRedeemed = true;
    }
}
