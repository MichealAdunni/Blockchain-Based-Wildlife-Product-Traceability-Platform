import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_SPECIES = 201;
const ERR_INVALID_ORIGIN = 202;
const ERR_INVALID_HARVEST_DATE = 203;
const ERR_INVALID_WEIGHT = 204;
const ERR_INVALID_DESCRIPTION = 205;
const ERR_INVALID_LOCATION = 210;
const ERR_INVALID_CURRENCY = 211;
const ERR_INVALID_UPDATE_PARAM = 213;
const ERR_MAX_PRODUCTS_EXCEEDED = 214;
const ERR_INVALID_ROLE = 215;
const ERR_INVALID_IMAGE_COUNT = 217;
const ERR_INVALID_IMAGE_URL = 218;
const ERR_INVALID_PRODUCT_ID = 219;
const ERR_PRODUCT_NOT_ACTIVE = 220;

interface Product {
  species: string;
  origin: string;
  harvestDate: number;
  weight: number;
  description: string;
  status: boolean;
  creator: string;
  location: string;
  currency: string;
  certId: number | null;
  images: string[];
  createdAt: number;
}

interface ProductUpdate {
  updatedSpecies: string;
  updatedOrigin: string;
  updatedWeight: number;
  updatedDescription: string;
  updatedLocation: string;
  updatedCurrency: string;
  updatedAt: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T | number; // Allow number for error codes
}

class RegistryMock {
  roles: Map<string, string> = new Map();

  getRole(principal: string): { role: string } | null {
    const role = this.roles.get(principal);
    return role ? { role } : null;
  }
}

class ProductContractMock {
  state: {
    nextProductId: number;
    maxProducts: number;
    creationFee: number;
    products: Map<number, Product>;
    productsByCreator: Map<string, number[]>;
    productUpdates: Map<number, ProductUpdate>;
  } = {
    nextProductId: 1,
    maxProducts: 100000,
    creationFee: 1000,
    products: new Map(),
    productsByCreator: new Map(),
    productUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  registry: RegistryMock;

  constructor(registry: RegistryMock) {
    this.registry = registry;
    this.reset();
  }

  reset() {
    this.state = {
      nextProductId: 1,
      maxProducts: 100000,
      creationFee: 1000,
      products: new Map(),
      productsByCreator: new Map(),
      productUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.registry.roles.clear();
  }

  private checkRole(requiredRole: string): Result<boolean> {
    const roleObj = this.registry.getRole(this.caller);
    if (!roleObj || roleObj.role !== requiredRole) {
      return { ok: false, value: ERR_INVALID_ROLE };
    }
    return { ok: true, value: true };
  }

  setMaxProducts(newMax: number): Result<boolean> {
    const roleCheck = this.checkRole("admin");
    if (!roleCheck.ok) return roleCheck;
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.maxProducts = newMax;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    const roleCheck = this.checkRole("admin");
    if (!roleCheck.ok) return roleCheck;
    if (newFee < 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  createProduct(
    species: string,
    origin: string,
    harvestDate: number,
    weight: number,
    description: string,
    location: string,
    currency: string,
    images: string[]
  ): Result<number> {
    const roleCheck = this.checkRole("supplier");
    if (!roleCheck.ok) return { ok: false, value: ERR_INVALID_ROLE };
    if (this.state.nextProductId >= this.state.maxProducts) return { ok: false, value: ERR_MAX_PRODUCTS_EXCEEDED };
    if (images.length > 10) return { ok: false, value: ERR_INVALID_IMAGE_COUNT };
    for (const url of images) {
      if (!url || url.length > 200) return { ok: false, value: ERR_INVALID_IMAGE_URL };
    }
    if (!species || species.length > 50) return { ok: false, value: ERR_INVALID_SPECIES };
    if (!origin || origin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (harvestDate > this.blockHeight) return { ok: false, value: ERR_INVALID_HARVEST_DATE };
    if (weight <= 0) return { ok: false, value: ERR_INVALID_WEIGHT };
    if (description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.caller });
    const productId = this.state.nextProductId;
    const product: Product = {
      species,
      origin,
      harvestDate,
      weight,
      description,
      status: true,
      creator: this.caller,
      location,
      currency,
      certId: null,
      images,
      createdAt: this.blockHeight,
    };
    this.state.products.set(productId, product);
    const creatorProducts = this.state.productsByCreator.get(this.caller) || [];
    creatorProducts.push(productId);
    this.state.productsByCreator.set(this.caller, creatorProducts);
    this.state.nextProductId++;
    return { ok: true, value: productId };
  }

  updateProduct(
    productId: number,
    newSpecies: string,
    newOrigin: string,
    newWeight: number,
    newDescription: string,
    newLocation: string,
    newCurrency: string
  ): Result<boolean> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (product.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!product.status) return { ok: false, value: ERR_PRODUCT_NOT_ACTIVE };
    if (!newSpecies || newSpecies.length > 50) return { ok: false, value: ERR_INVALID_SPECIES };
    if (!newOrigin || newOrigin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (newWeight <= 0) return { ok: false, value: ERR_INVALID_WEIGHT };
    if (newDescription.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!newLocation || newLocation.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(newCurrency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    const updated: Product = {
      ...product,
      species: newSpecies,
      origin: newOrigin,
      weight: newWeight,
      description: newDescription,
      location: newLocation,
      currency: newCurrency,
    };
    this.state.products.set(productId, updated);
    this.state.productUpdates.set(productId, {
      updatedSpecies: newSpecies,
      updatedOrigin: newOrigin,
      updatedWeight: newWeight,
      updatedDescription: newDescription,
      updatedLocation: newLocation,
      updatedCurrency: newCurrency,
      updatedAt: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  linkCertification(productId: number, certId: number): Result<boolean> {
    const roleCheck = this.checkRole("certifier");
    if (!roleCheck.ok) return { ok: false, value: ERR_INVALID_ROLE };
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (!product.status) return { ok: false, value: ERR_PRODUCT_NOT_ACTIVE };
    if (product.certId !== null) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    product.certId = certId;
    this.state.products.set(productId, product);
    return { ok: true, value: true };
  }

  deactivateProduct(productId: number): Result<boolean> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (product.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!product.status) return { ok: false, value: ERR_PRODUCT_NOT_ACTIVE };
    product.status = false;
    this.state.products.set(productId, product);
    return { ok: true, value: true };
  }

  getProduct(productId: number): Product | null {
    return this.state.products.get(productId) || null;
  }

  getProductUpdates(productId: number): ProductUpdate | null {
    return this.state.productUpdates.get(productId) || null;
  }

  getProductsByCreator(creator: string): number[] {
    return this.state.productsByCreator.get(creator) || [];
  }

  getProductCount(): Result<number> {
    return { ok: true, value: this.state.nextProductId };
  }
}

describe("ProductContract", () => {
  let registry: RegistryMock;
  let contract: ProductContractMock;

  beforeEach(() => {
    registry = new RegistryMock();
    contract = new ProductContractMock(registry);
    contract.reset();
  });

  it("rejects creation with invalid role", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "buyer");
    const result = contract.createProduct(
      "Elephant Ivory",
      "Africa",
      100,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      ["url1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("rejects creation with invalid species", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    const result = contract.createProduct(
      "",
      "Africa",
      100,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      ["url1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SPECIES);
  });

  it("rejects creation with future harvest date", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    const result = contract.createProduct(
      "Elephant Ivory",
      "Africa",
      1000,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      ["url1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HARVEST_DATE);
  });

  it("rejects creation with too many images", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    const images = Array(11).fill("url");
    const result = contract.createProduct(
      "Elephant Ivory",
      "Africa",
      100,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      images
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_IMAGE_COUNT);
  });

  it("rejects update for non-existent product", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    const result = contract.updateProduct(99, "Rhino Horn", "Asia", 300, "Small horn", "Jungle", "BTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCT_ID);
  });

  it("rejects linking certification with invalid role", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    contract.createProduct(
      "Elephant Ivory",
      "Africa",
      100,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      ["url1"]
    );
    contract.caller = "ST4CERT";
    registry.roles.set("ST4CERT", "buyer");
    const result = contract.linkCertification(1, 42);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("rejects linking to already certified product", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    contract.createProduct(
      "Elephant Ivory",
      "Africa",
      100,
      500,
      "Large tusk",
      "Savanna",
      "USD",
      ["url1"]
    );
    contract.caller = "ST4CERT";
    registry.roles.set("ST4CERT", "certifier");
    contract.linkCertification(1, 42);
    contract.caller = "ST4CERT";
    const result = contract.linkCertification(1, 43);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCT_ID);
  });

  it("sets creation fee successfully", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "admin");
    const result = contract.setCreationFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.creationFee).toBe(2000);
  });

  it("rejects creation fee change with invalid role", () => {
    contract.caller = "ST1TEST";
    registry.roles.set("ST1TEST", "supplier");
    const result = contract.setCreationFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("parses product parameters with Clarity types", () => {
    const species = stringUtf8CV("Elephant Ivory");
    const origin = stringUtf8CV("Africa");
    const harvestDate = uintCV(100);
    const weight = uintCV(500);
    const description = stringUtf8CV("Large tusk");
    const location = stringUtf8CV("Savanna");
    const currency = stringUtf8CV("USD");
    const images = listCV([stringUtf8CV("url1"), stringUtf8CV("url2")]);
    expect(species.value).toBe("Elephant Ivory");
    expect(origin.value).toBe("Africa");
    expect(harvestDate.value).toEqual(BigInt(100));
    expect(weight.value).toEqual(BigInt(500));
    expect(description.value).toBe("Large tusk");
    expect(location.value).toBe("Savanna");
    expect(currency.value).toBe("USD");
    expect(images.value.length).toBe(2);
  });
});