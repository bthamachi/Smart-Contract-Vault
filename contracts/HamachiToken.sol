// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HamachiToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Hamachi Token", "HMC") {
        _mint(msg.sender, initialSupply);
    }
}
