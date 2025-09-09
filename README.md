# WildTrace: Blockchain-Based Wildlife Product Traceability Platform

## Overview

WildTrace is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses the real-world problem of illegal wildlife trade, such as poaching and smuggling of products like ivory, rhino horns, and endangered animal pelts. By leveraging blockchain's immutability and transparency, WildTrace ensures that wildlife products are legally sourced, certified, and tracked from origin to end consumer. This combats wildlife trafficking (estimated at $23 billion annually by UN reports), promotes sustainable practices, and provides verifiable proof for regulators, buyers, and conservation organizations.

The platform involves a decentralized system where:
- Authorities certify legal harvests or trades.
- Suppliers log product origins and transfers.
- Buyers verify authenticity and legality via blockchain queries.
- Audits ensure compliance, reducing fraud and enabling penalties for violations.

Key features:
- Immutable supply chain tracking to prevent tampering.
- NFT representation for unique products (e.g., individual ivory tusks).
- Integration with off-chain oracles for real-world data (e.g., GPS from harvest sites, though not implemented in contracts here).
- Decentralized governance for system updates.

This project uses 7 Clarity smart contracts to handle registration, product management, certification, tracking, auditing, tokenization, and governance.

## Problem Solved

Illegal wildlife trade endangers species and fuels organized crime. Traditional tracking relies on paper certificates prone to forgery. WildTrace solves this by:
- Providing tamper-proof provenance.
- Enabling real-time verification for customs, retailers, and consumers.
- Incentivizing compliance through tokenized ownership.
- Supporting global regulations like CITES (Convention on International Trade in Endangered Species).

## Architecture

The system is composed of 7 interconnected smart contracts:
1. **RegistryContract**: Manages user registration and roles.
2. **ProductContract**: Handles product creation and metadata.
3. **CertificationContract**: Issues and verifies legal certificates.
4. **TraceabilityContract**: Logs supply chain events.
5. **AuditContract**: Enables querying and reporting for compliance.
6. **TokenContract**: Manages NFTs for product ownership.
7. **GovernanceContract**: Handles proposals and updates.

Contracts interact via public functions, with access controls based on roles (e.g., admin, supplier, verifier).

## Smart Contracts

Below is a high-level description of each contract, including key traits, functions, and Clarity pseudocode snippets. Full implementation would require deployment on Stacks testnet/mainnet.

### 1. RegistryContract
- **Purpose**: Registers stakeholders (e.g., authorities, suppliers, buyers) and assigns roles for access control.
- **Key Features**: Role-based access (admin, certifier, supplier, auditor). Prevents unauthorized actions.
- **Clarity Snippet**:
  ```
  (define-map users principal {role: (string-ascii 20)})
  (define-public (register-user (user principal) (role (string-ascii 20)))
    (if (is-none (map-get? users user))
      (ok (map-set users user {role: role}))
      (err u100)))  ;; Error: User already registered
  (define-read-only (get-role (user principal))
    (map-get? users user))
  ```

### 2. ProductContract
- **Purpose**: Creates and stores metadata for wildlife products (e.g., species, origin, harvest date).
- **Key Features**: Unique product IDs. Links to certifications.
- **Clarity Snippet**:
  ```
  (define-map products uint {species: (string-ascii 50), origin: (string-ascii 100), harvest-date: uint, cert-id: (optional uint)})
  (define-data-var next-product-id uint u1)
  (define-public (create-product (species (string-ascii 50)) (origin (string-ascii 100)) (harvest-date uint))
    (let ((product-id (var-get next-product-id)))
      (map-set products product-id {species: species, origin: origin, harvest-date: harvest-date, cert-id: none})
      (var-set next-product-id (+ product-id u1))
      (ok product-id)))
  (define-read-only (get-product (product-id uint))
    (map-get? products product-id))
  ```

### 3. CertificationContract
- **Purpose**: Issues digital certificates of legality by authorized certifiers.
- **Key Features**: Certificates include proof of compliance (e.g., legal permit). Revocable if fraud detected.
- **Clarity Snippet**:
  ```
  (define-map certificates uint {product-id: uint, issuer: principal, status: (string-ascii 20), issue-date: uint})
  (define-data-var next-cert-id uint u1)
  (define-public (issue-certificate (product-id uint) (status (string-ascii 20)))
    (if (is-eq (unwrap! (contract-call? .registry-contract get-role tx-sender) (err u101)) "certifier")
      (let ((cert-id (var-get next-cert-id)))
        (map-set certificates cert-id {product-id: product-id, issuer: tx-sender, status: status, issue-date: block-height})
        (var-set next-cert-id (+ cert-id u1))
        (ok cert-id))
      (err u102)))  ;; Error: Not a certifier
  (define-public (revoke-certificate (cert-id uint))
    (if (is-eq (unwrap-panic (map-get? certificates cert-id)).issuer tx-sender)
      (ok (map-set certificates cert-id {status: "revoked"}))
      (err u103)))
  ```

### 4. TraceabilityContract
- **Purpose**: Tracks transfers in the supply chain, logging each custody change.
- **Key Features**: Immutable event log. Verifies chain from origin to current owner.
- **Clarity Snippet**:
  ```
  (define-map transfers uint (list 100 {from: principal, to: principal, timestamp: uint, product-id: uint}))
  (define-data-var next-transfer-id uint u1)
  (define-public (log-transfer (product-id uint) (to principal))
    (let ((transfer-id (var-get next-transfer-id))
          (existing (default-to (list) (map-get? transfers product-id))))
      (map-set transfers product-id (append existing {from: tx-sender, to: to, timestamp: block-height, product-id: product-id}))
      (var-set next-transfer-id (+ transfer-id u1))
      (ok transfer-id)))
  (define-read-only (get-chain (product-id uint))
    (map-get? transfers product-id))
  ```

### 5. AuditContract
- **Purpose**: Allows auditors to query and generate reports on products and chains.
- **Key Features**: Read-only access for verification. Flags suspicious activities (e.g., broken chains).
- **Clarity Snippet**:
  ```
  (define-public (audit-product (product-id uint))
    (if (is-eq (unwrap! (contract-call? .registry-contract get-role tx-sender) (err u104)) "auditor")
      (let ((product (contract-call? .product-contract get-product product-id))
            (chain (contract-call? .traceability-contract get-chain product-id))
            (cert (contract-call? .certification-contract get-certificate (unwrap-panic product.cert-id))))
        (ok {product: product, chain: chain, cert: cert}))
      (err u105)))  ;; Error: Not an auditor
  ```

### 6. TokenContract
- **Purpose**: Represents products as NFTs for ownership and transfer.
- **Key Features**: SIP-009 compliant NFT trait. Transfers update traceability.
- **Clarity Snippet**:
  ```
  (define-non-fungible-token wildlife-nft uint)
  (define-public (mint-nft (product-id uint) (recipient principal))
    (if (is-eq (unwrap! (contract-call? .registry-contract get-role tx-sender) (err u106)) "supplier")
      (nft-mint? wildlife-nft product-id recipient)
      (err u107)))
  (define-public (transfer-nft (token-id uint) (sender principal) (recipient principal))
    (begin
      (asserts! (is-eq tx-sender sender) (err u108))
      (contract-call? .traceability-contract log-transfer token-id recipient)
      (nft-transfer? wildlife-nft token-id sender recipient)))
  ```

### 7. GovernanceContract
- **Purpose**: Manages system upgrades, role assignments, and dispute resolutions via proposals.
- **Key Features**: Voting by admins. Time-locked changes.
- **Clarity Snippet**:
  ```
  (define-map proposals uint {proposer: principal, description: (string-ascii 200), votes-for: uint, votes-against: uint, end-time: uint})
  (define-data-var next-proposal-id uint u1)
  (define-public (create-proposal (description (string-ascii 200)) (duration uint))
    (if (is-eq (unwrap! (contract-call? .registry-contract get-role tx-sender) (err u109)) "admin")
      (let ((proposal-id (var-get next-proposal-id)))
        (map-set proposals proposal-id {proposer: tx-sender, description: description, votes-for: u0, votes-against: u0, end-time: (+ block-height duration)})
        (var-set next-proposal-id (+ proposal-id u1))
        (ok proposal-id))
      (err u110)))
  (define-public (vote (proposal-id uint) (support bool))
    ;; Voting logic here
    )
  ```

## Installation and Deployment

1. **Prerequisites**: Install Clarity CLI and Stacks wallet. Use Stacks testnet for development.
2. **Clone Repository**: `git clone https://github.com/your-repo/wildtrace.git`
3. **Deploy Contracts**: Use Clarinet to deploy:
   - `clarinet contract deploy registry-contract.clar`
   - Repeat for others, handling dependencies (e.g., Registry first).
4. **Interact**: Use Stacks Explorer or SDK to call functions.
5. **Frontend Integration**: Build a dApp with React/Web3.js for user interface (not included here).

## Usage

- Register as a certifier: Call `register-user` in RegistryContract.
- Create a product: Use ProductContract, then issue cert via CertificationContract.
- Transfer: Mint NFT, log transfers.
- Verify: Audit via AuditContract.

## License

MIT License. Contributions welcome for enhancements like oracle integration.