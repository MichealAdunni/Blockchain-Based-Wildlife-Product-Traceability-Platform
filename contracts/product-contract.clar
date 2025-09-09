(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-SPECIES u201)
(define-constant ERR-INVALID-ORIGIN u202)
(define-constant ERR-INVALID-HARVEST-DATE u203)
(define-constant ERR-INVALID-WEIGHT u204)
(define-constant ERR-INVALID-DESCRIPTION u205)
(define-constant ERR-INVALID-STATUS u206)
(define-constant ERR-PRODUCT-ALREADY-EXISTS u207)
(define-constant ERR-PRODUCT-NOT-FOUND u208)
(define-constant ERR-INVALID-TIMESTAMP u209)
(define-constant ERR-INVALID-LOCATION u210)
(define-constant ERR-INVALID-CURRENCY u211)
(define-constant ERR-INVALID-CERT-ID u212)
(define-constant ERR-INVALID-UPDATE-PARAM u213)
(define-constant ERR-MAX-PRODUCTS-EXCEEDED u214)
(define-constant ERR-INVALID-ROLE u215)
(define-constant ERR-CERT-ALREADY-LINKED u216)
(define-constant ERR-INVALID-IMAGE-COUNT u217)
(define-constant ERR-INVALID-IMAGE-URL u218)

(define-data-var next-product-id uint u1)
(define-data-var max-products uint u100000)
(define-data-var creation-fee uint u1000)

(define-map products
  uint
  {
    species: (string-utf8 50),
    origin: (string-utf8 100),
    harvest-date: uint,
    weight: uint,
    description: (string-utf8 500),
    status: bool,
    creator: principal,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    cert-id: (optional uint),
    images: (list 10 (string-utf8 200)),
    created-at: uint
  }
)

(define-map products-by-creator
  principal
  (list 100 uint)
)

(define-map product-updates
  uint
  {
    updated-species: (string-utf8 50),
    updated-origin: (string-utf8 100),
    updated-weight: uint,
    updated-description: (string-utf8 500),
    updated-location: (string-utf8 100),
    updated-currency: (string-utf8 20),
    updated-at: uint,
    updater: principal
  }
)

(define-read-only (get-product (product-id uint))
  (map-get? products product-id)
)

(define-read-only (get-product-updates (product-id uint))
  (map-get? product-updates product-id)
)

(define-read-only (get-products-by-creator (creator principal))
  (default-to (list) (map-get? products-by-creator creator))
)

(define-read-only (get-product-count)
  (var-get next-product-id)
)

(define-private (validate-species (species (string-utf8 50)))
  (if (and (> (len species) u0) (<= (len species) u50))
    (ok true)
    (err ERR-INVALID-SPECIES))
)

(define-private (validate-origin (origin (string-utf8 100)))
  (if (and (> (len origin) u0) (<= (len origin) u100))
    (ok true)
    (err ERR-INVALID-ORIGIN))
)

(define-private (validate-harvest-date (date uint))
  (if (<= date block-height)
    (ok true)
    (err ERR-INVALID-HARVEST-DATE))
)

(define-private (validate-weight (weight uint))
  (if (> weight u0)
    (ok true)
    (err ERR-INVALID-WEIGHT))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (<= (len desc) u500)
    (ok true)
    (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
    (ok true)
    (err ERR-INVALID-CURRENCY))
)

(define-private (validate-images (imgs (list 10 (string-utf8 200))))
  (if (<= (len imgs) u10)
    (fold validate-image-url imgs (ok true))
    (err ERR-INVALID-IMAGE-COUNT))
)

(define-private (validate-image-url (url (string-utf8 200)) (acc (response bool uint)))
  (match acc
    ok-value
    (if (and (> (len url) u0) (<= (len url) u200))
      (ok true)
      (err ERR-INVALID-IMAGE-URL))
    err-value (err err-value))
)

(define-private (check-role (required-role (string-ascii 20)))
  (let
    (
      (role-opt (contract-call? .registry-contract get-role tx-sender))
    )
    (match role-opt
      role-map
      (if (is-eq (get role role-map) required-role)
        (ok true)
        (err ERR-INVALID-ROLE))
      (err ERR-NOT-AUTHORIZED))
  )
)

(define-public (set-max-products (new-max uint))
  (begin
    (try! (check-role "admin"))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-products new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (try! (check-role "admin"))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (create-product
  (species (string-utf8 50))
  (origin (string-utf8 100))
  (harvest-date uint)
  (weight uint)
  (description (string-utf8 500))
  (location (string-utf8 100))
  (currency (string-utf8 20))
  (images (list 10 (string-utf8 200)))
)
  (let
    (
      (product-id (var-get next-product-id))
      (creator-products (get-products-by-creator tx-sender))
    )
    (try! (check-role "supplier"))
    (asserts! (< product-id (var-get max-products)) (err ERR-MAX-PRODUCTS-EXCEEDED))
    (try! (validate-species species))
    (try! (validate-origin origin))
    (try! (validate-harvest-date harvest-date))
    (try! (validate-weight weight))
    (try! (validate-description description))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (try! (validate-images images))
    (try! (stx-transfer? (var-get creation-fee) tx-sender (as-contract tx-sender)))
    (map-set products product-id
      {
        species: species,
        origin: origin,
        harvest-date: harvest-date,
        weight: weight,
        description: description,
        status: true,
        creator: tx-sender,
        location: location,
        currency: currency,
        cert-id: none,
        images: images,
        created-at: block-height
      }
    )
    (map-set products-by-creator tx-sender (append creator-products product-id))
    (var-set next-product-id (+ product-id u1))
    (print { event: "product-created", id: product-id })
    (ok product-id)
  )
)

(define-public (update-product
  (product-id uint)
  (new-species (string-utf8 50))
  (new-origin (string-utf8 100))
  (new-weight uint)
  (new-description (string-utf8 500))
  (new-location (string-utf8 100))
  (new-currency (string-utf8 20))
)
  (let
    (
      (product (map-get? products product-id))
    )
    (match product
      p
      (begin
        (asserts! (is-eq (get creator p) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-species new-species))
        (try! (validate-origin new-origin))
        (try! (validate-weight new-weight))
        (try! (validate-description new-description))
        (try! (validate-location new-location))
        (try! (validate-currency new-currency))
        (map-set products product-id
          {
            species: new-species,
            origin: new-origin,
            harvest-date: (get harvest-date p),
            weight: new-weight,
            description: new-description,
            status: (get status p),
            creator: (get creator p),
            location: new-location,
            currency: new-currency,
            cert-id: (get cert-id p),
            images: (get images p),
            created-at: (get created-at p)
          }
        )
        (map-set product-updates product-id
          {
            updated-species: new-species,
            updated-origin: new-origin,
            updated-weight: new-weight,
            updated-description: new-description,
            updated-location: new-location,
            updated-currency: new-currency,
            updated-at: block-height,
            updater: tx-sender
          }
        )
        (print { event: "product-updated", id: product-id })
        (ok true)
      )
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)

(define-public (link-certification (product-id uint) (cert-id uint))
  (let
    (
      (product (map-get? products product-id))
    )
    (match product
      p
      (begin
        (try! (check-role "certifier"))
        (asserts! (is-none (get cert-id p)) (err ERR-CERT-ALREADY-LINKED))
        (map-set products product-id
          (merge p { cert-id: (some cert-id) })
        )
        (print { event: "cert-linked", product-id: product-id, cert-id: cert-id })
        (ok true)
      )
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)

(define-public (deactivate-product (product-id uint))
  (let
    (
      (product (map-get? products product-id))
    )
    (match product
      p
      (begin
        (asserts! (is-eq (get creator p) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (get status p) (err ERR-INVALID-STATUS))
        (map-set products product-id
          (merge p { status: false })
        )
        (print { event: "product-deactivated", id: product-id })
        (ok true)
      )
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)