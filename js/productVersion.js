export const productInfo = Object.freeze({
  productName: "MetKinetics PlantView",
  version: "1.0.0",
  copyright: "© 2026 MetKinetics",
  status: "Release"
});

export function renderProductInformation(root = document) {
  root.querySelectorAll("[data-product-name]").forEach((element) => { element.textContent = productInfo.productName; });
  root.querySelectorAll("[data-product-version]").forEach((element) => { element.textContent = `Versión ${productInfo.version}`; });
  root.querySelectorAll("[data-product-copyright]").forEach((element) => { element.textContent = productInfo.copyright; });
}

renderProductInformation();
