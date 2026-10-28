"use strict";

const defaults = { product: "MacBook", price: "8000", cost: "6200", quantity: "12" };
const el = id => document.getElementById(id);
const fields = Object.fromEntries(Object.keys(defaults).map(key => [key, el(key)]));
const money = value => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(value);
const percent = value => Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
// 所有占比统一检查分子、分母，零销售额不参与除法。
function safePercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const result = numerator / denominator * 100;
  return Number.isFinite(result) ? result : null;
}

function showMarginRating(element, margin) {
  const valid = Number.isFinite(margin);
  const good = valid && margin >= 20;
  element.textContent = !valid ? "利润率不适用" : good ? "Good Profit Margin" : "Low Profit Margin";
  element.className = `margin-rating ${!valid ? "margin-unavailable" : good ? "margin-good" : "margin-low"}`;
}

// 先从字符串精确解析整数分，避免先转 Number 导致大金额丢失分位。
function parseCents(value) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, decimal = ""] = raw.split(".");
  const cents = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
let nextId = 1;
let products = [];
let editingId = null;
const STORAGE_KEY = "salesStudioProducts";

function storageMessage(message, warning = false) {
  el("storage-status").textContent = message;
  el("storage-status").className = `storage-status${warning ? " storage-warning" : ""}`;
}

function saveProducts() {
  try {
    // 只保存原始业务字段；利润、销售额等在恢复时重新计算。
    const data = products.map(({ product, priceCents, costCents, quantity }) => ({
      product, priceCents, costCents, quantity
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, products: data }));
    storageMessage("已自动保存到此浏览器。刷新后可恢复商品列表。");
  } catch {
    // 拒绝访问或空间不足时，当前页面仍可正常计算和增删商品。
    storageMessage("自动保存失败：当前更改仅在本页有效，刷新可能丢失。请检查浏览器存储权限或空间；下次添加、修改或删除时会重试。", true);
  }
}

function restoreProducts(raw) {
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.products)) throw new Error("无效存档格式");
  const restored = data.products.map((item, index) => {
    if (!item || typeof item.product !== "string" || !item.product.trim() || item.product.trim().length > 80
      || ![item.priceCents, item.costCents, item.quantity].every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error("无效商品数据");
    }
    const revenueCents = item.priceCents * item.quantity;
    const totalCostCents = item.costCents * item.quantity;
    if (![revenueCents, totalCostCents].every(Number.isSafeInteger)) throw new Error("商品金额超出范围");
    // 不信任存档中的 ID 和衍生结果；每次恢复重新分配唯一 ID。
    return { product: item.product.trim(), priceCents: item.priceCents, costCents: item.costCents,
      quantity: item.quantity, revenueCents, totalCostCents,
      profitCents: revenueCents - totalCostCents, id: index + 1 };
  });
  if (!summarize(restored)) throw new Error("累计数据超出范围");
  return restored;
}

function loadProducts() {
  const useDefaults = () => {
    products = [{ ...calculate(8000, 6200, 12), product: "MacBook", id: 1 }];
    nextId = 2;
  };
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    useDefaults();
    storageMessage("无法读取浏览器存储，暂用默认商品。当前数据尚未保存；下次添加、修改或删除时会尝试保存。", true);
    return;
  }
  // null 表示首次使用；已保存的空数组是用户主动清空，必须保留。
  if (raw === null) {
    useDefaults();
    saveProducts();
    return;
  }
  try {
    products = restoreProducts(raw);
    nextId = products.length + 1;
    storageMessage(`已从此浏览器恢复 ${products.length} 条商品记录。添加、修改或删除后会自动保存。`);
  } catch {
    useDefaults();
    storageMessage("存档损坏、含无效数据或版本不受支持，暂用默认商品。原存档暂未覆盖；下次添加、修改或删除会保存当前列表并替换原存档。", true);
  }
}

// 使用整数“分”保存和汇总金额，检查单条及累计结果的安全范围。
function calculate(price, cost, quantity) {
  const priceCents = parseCents(price);
  const costCents = parseCents(cost);
  if (priceCents === null || costCents === null || quantity < 0) return null;
  const revenueCents = priceCents * quantity;
  const totalCostCents = costCents * quantity;
  if (![priceCents, costCents, quantity, revenueCents, totalCostCents].every(Number.isSafeInteger)) return null;
  return { priceCents, costCents, quantity, revenueCents, totalCostCents, profitCents: revenueCents - totalCostCents };
}

function summarize(items) {
  const totals = items.reduce((sum, item) => ({
    revenueCents: sum.revenueCents + item.revenueCents,
    totalCostCents: sum.totalCostCents + item.totalCostCents,
    quantity: sum.quantity + item.quantity
  }), { revenueCents: 0, totalCostCents: 0, quantity: 0 });
  if (!Object.values(totals).every(Number.isSafeInteger)) return null;
  return { ...totals, profitCents: totals.revenueCents - totals.totalCostCents };
}

function readProduct() {
  let valid = true;
  for (const [key, field] of Object.entries(fields)) {
    const raw = field.value.trim();
    let error = "";
    if (!raw) error = key === "product" ? "请输入商品名称。" : "请输入有效数值，不能为空。";
    else if (key === "product") {
      if (raw.length > 80) error = "商品名称不能超过 80 个字符。";
    } else if (!Number.isFinite(Number(raw)) || Number(raw) < 0 || !/^\d+(?:\.\d+)?$/.test(raw)) {
      error = "请输入大于或等于 0 的数字。";
    } else if (key === "quantity" && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
      error = "销售数量必须为有效的非负整数。";
    } else if (key !== "quantity" && (raw.split(".")[1] || "").length > 2) {
      error = "金额最多保留两位小数。";
    }
    field.setAttribute("aria-invalid", String(Boolean(error)));
    el(`${key}-error`).textContent = error;
    if (error) valid = false;
  }
  el("form-error").textContent = "";
  if (!valid) return null;
  const item = calculate(fields.price.value, fields.cost.value, Number(fields.quantity.value));
  // 编辑时先排除旧记录，再校验替换后的汇总，避免重复计入。
  const others = products.filter(product => product.id !== editingId);
  if (!item || !summarize([...others, item])) {
    el("form-error").textContent = "金额、数量或累计结果过大，请减小数值后重试。";
    return null;
  }
  return { ...item, product: fields.product.value.trim() };
}

function clearFormErrors() {
  for (const [key, field] of Object.entries(fields)) {
    field.setAttribute("aria-invalid", "false");
    el(`${key}-error`).textContent = "";
  }
  el("form-error").textContent = "";
}

function finishEditing() {
  editingId = null;
  el("input-title").textContent = "添加商品";
  el("save-product").textContent = "＋ 添加到商品列表";
  el("cancel-edit").hidden = true;
  for (const field of Object.values(fields)) field.value = "";
  clearFormErrors();
}

function startEditing(item) {
  editingId = item.id;
  fields.product.value = item.product;
  // 整数分直接拼接字符串，避免大金额在编辑回填时损失精度。
  const centsText = cents => `${BigInt(cents) / 100n}.${String(BigInt(cents) % 100n).padStart(2, "0")}`;
  fields.price.value = centsText(item.priceCents);
  fields.cost.value = centsText(item.costCents);
  fields.quantity.value = String(item.quantity);
  clearFormErrors();
  el("input-title").textContent = "修改商品";
  el("save-product").textContent = "保存修改";
  el("cancel-edit").hidden = false;
  fields.product.focus();
  el("announcement").textContent = `正在修改 ${item.product}，点击保存修改后生效。`;
}

function rankProducts(items) {
  return items.map((item, index) => {
    // 排名前防御性校验，并从原始字段重算，避免 NaN 参与比较。
    if (!item || typeof item.product !== "string" || !item.product.trim() || item.product.trim().length > 80
      || ![item.priceCents, item.costCents, item.quantity].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
    const revenueCents = item.priceCents * item.quantity;
    const totalCostCents = item.costCents * item.quantity;
    if (![revenueCents, totalCostCents].every(Number.isSafeInteger)) return null;
    return { ...item, revenueCents, profitCents: revenueCents - totalCostCents, originalIndex: index };
  }).filter(item => item !== null)
    // sort 仅修改 map 产生的新数组；显式使用原下标保证同利润顺序。
    .sort((a, b) => b.profitCents - a.profitCents || a.originalIndex - b.originalIndex);
}

function renderRanking() {
  const ranked = rankProducts(products);
  const rows = el("ranking-rows");
  rows.replaceChildren();
  ranked.forEach((item, index) => {
    const row = document.createElement("tr");
    const values = [String(index + 1), item.product, money(item.profitCents / 100), percent(safePercent(item.profitCents, item.revenueCents))];
    values.forEach((value, column) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (item.profitCents < 0 && column >= 2) cell.className = "negative";
      row.append(cell);
    });
    rows.append(row);
  });
  el("ranking-empty").hidden = ranked.length > 0;
  const skipped = products.length - ranked.length;
  el("ranking-warning").hidden = skipped === 0;
  el("ranking-warning").textContent = skipped ? `${skipped} 条无效记录未参与排名，请检查商品数据。` : "";
}

// 纯数据计算：校验和重算复用排行榜逻辑，不修改商品或存档。
function calculateBusinessInsights(items) {
  const inputInvalid = !Array.isArray(items);
  const source = inputInvalid ? [] : items;
  const ranked = rankProducts(source).map(item => ({
    ...item,
    totalCostCents: item.costCents * item.quantity,
    margin: safePercent(item.profitCents, item.revenueCents)
  }));
  const totals = summarize(ranked);
  const originalOrder = [...ranked].sort((a, b) => a.originalIndex - b.originalIndex);
  return {
    inputInvalid,
    invalidCount: source.length - ranked.length,
    validCount: ranked.length,
    overflow: totals === null,
    totals,
    margin: totals ? safePercent(totals.profitCents, totals.revenueCents) : null,
    // 同利润全部显示；rankProducts 已保证原明细顺序。
    topProducts: ranked.length ? ranked.filter(item => item.profitCents === ranked[0].profitCents) : [],
    lowMarginProducts: originalOrder.filter(item => item.margin !== null && item.margin < 20),
    zeroRevenueProducts: originalOrder.filter(item => item.revenueCents === 0)
  };
}

// 纯规则建议：只读取计算结果，不操作 DOM，也不调用任何 AI 服务。
function generateBusinessAdvice(data) {
  if (data.inputInvalid || data.overflow) return ["商品数据格式或累计数值异常，请先核对数据，再进行经营分析。"];
  if (!data.validCount) return [data.invalidCount ? "当前没有有效商品，请修正无效数据后再分析。" : "请先添加商品及销售数据，再查看利润表现与经营建议。"];
  const advice = [];
  if (data.invalidCount) advice.push("以下建议仅基于有效记录，请先修正被排除的数据，再评估完整经营表现。");
  if (data.totals.revenueCents === 0) {
    advice.push(data.totals.profitCents < 0
      ? "当前没有销售收入但已产生成本，请核对零售价、赠品及成本记录，优先检查亏损来源。"
      : "当前没有销售收入，请核对售价与销售数量；暂不判断利润率是否达标。");
  } else if (data.totals.profitCents < 0) {
    advice.push("整体处于亏损状态，建议优先核查亏损商品的定价与采购成本，评估减少低效促销。");
  } else if (data.margin < 20) {
    advice.push("整体利润率低于 20%，建议评估调整售价、采购成本或促销折扣的可行性。");
  } else {
    advice.push("整体利润率已达到 20% 的设定目标，建议保持成本监控，并观察销售数量变化。");
  }
  if (data.lowMarginProducts.length) advice.push(`有 ${data.lowMarginProducts.length} 条商品记录的利润率低于 20%，请优先复核上方提醒名单中的定价、成本与折扣。`);
  if (data.zeroRevenueProducts.length && data.totals.revenueCents > 0) advice.push("部分商品销售额为零，无法评价其利润率，请核对这些商品的售价和销量。");
  if (data.topProducts[0].profitCents > 0) {
    advice.push(data.topProducts.length > 1
      ? "多条商品记录并列贡献最高利润，可结合各自销量与市场需求评估资源安排，不能仅凭利润推断未来表现。"
      : "可优先关注总利润最高商品的库存与销售支持，结合市场需求决定是否增加投入。");
  } else if (data.topProducts[0].profitCents < 0) {
    advice.push("所有有效商品均亏损，“总利润最高”仅表示亏损最少，暂不建议据此扩大投入。");
  } else {
    advice.push("当前没有正利润商品，建议先检查零销量、收支平衡及亏损记录，再考虑扩大销售。");
  }
  return advice;
}

function renderBusinessInsights() {
  const data = calculateBusinessInsights(products);
  const available = data.validCount > 0 && !data.inputInvalid && !data.overflow;
  el("business-margin").textContent = available ? percent(data.margin) : "—";
  el("business-profit").textContent = data.inputInvalid || data.overflow || (!data.validCount && data.invalidCount)
    ? "—" : money(data.totals.profitCents / 100);
  el("business-profit").classList.toggle("negative", available && data.totals.profitCents < 0);
  const warning = data.inputInvalid || data.overflow ? "数据格式或累计数值异常，暂不提供经营结论。"
    : data.invalidCount ? `已排除 ${data.invalidCount} 条无效记录；以下统计仅基于 ${data.validCount} 条有效记录。` : "";
  el("business-data-note").textContent = warning;
  el("business-data-note").hidden = !warning;
  const fillList = (id, messages) => {
    const list = el(id);
    list.replaceChildren();
    for (const message of messages) {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    }
  };
  // 明细序号用于区分同名商品，名称始终以纯文本显示。
  const label = item => `${item.product}（明细第 ${item.originalIndex + 1} 条）`;
  el("business-top-note").textContent = !available ? "暂无可分析商品。"
    : `${data.topProducts.length > 1 ? "并列最高，按原明细顺序显示。" : "按总利润识别。"}${data.topProducts[0].profitCents < 0 ? "当前最高值仍为亏损。" : ""}`;
  fillList("business-top", available ? data.topProducts.map(item => `${label(item)}：总利润 ${money(item.profitCents / 100)}，利润率 ${percent(item.margin)}`) : []);
  el("business-low-note").textContent = !available ? "暂无可判断的商品。"
    : data.lowMarginProducts.length ? `${data.lowMarginProducts.length} 条记录低于目标，请关注：`
    : "可计算利润率的商品中，没有低于 20% 的记录。";
  fillList("business-low", available ? data.lowMarginProducts.map(item => `${label(item)}：利润率 ${percent(item.margin)}，总利润 ${money(item.profitCents / 100)}`) : []);
  el("business-zero-note").textContent = available && data.zeroRevenueProducts.length
    ? `零销售额，利润率不适用（不计入低利润率名单）：${data.zeroRevenueProducts.map(label).join("、")}。` : "";
  fillList("business-advice", generateBusinessAdvice(data));
}

function render() {
  const rows = el("product-rows");
  rows.replaceChildren();
  for (const item of products) {
    const row = document.createElement("tr");
    const itemMargin = safePercent(item.profitCents, item.revenueCents);
    const values = [item.product, money(item.priceCents / 100), money(item.costCents / 100), item.quantity.toLocaleString("zh-CN"), money(item.revenueCents / 100), money(item.profitCents / 100), percent(itemMargin)];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      // 商品名称作为纯文本插入，避免把用户输入当作 HTML。
      cell.textContent = value;
      if (item.profitCents < 0 && index >= 5) cell.className = "negative";
      if (index === 6) {
        const rating = document.createElement("span");
        showMarginRating(rating, itemMargin);
        cell.append(rating);
      }
      row.append(cell);
    });
    const action = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "删除";
    button.className = "delete-button";
    button.setAttribute("aria-label", `删除商品 ${item.product}`);
    button.addEventListener("click", () => {
      const index = products.findIndex(product => product.id === item.id);
      products = products.filter(product => product.id !== item.id);
      if (editingId === item.id) finishEditing();
      render();
      saveProducts();
      const buttons = rows.querySelectorAll(".delete-button");
      (buttons[Math.min(index, buttons.length - 1)] || fields.product).focus();
      el("announcement").textContent = `已删除 ${item.product}，剩余 ${products.length} 条商品记录。`;
    });
    action.append(button);
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "修改";
    editButton.className = "edit-button";
    editButton.setAttribute("aria-label", `修改商品 ${item.product}`);
    editButton.addEventListener("click", () => startEditing(item));
    action.append(editButton);
    row.append(action);
    rows.append(row);
  }
  const totals = summarize(products);
  const revenue = totals.revenueCents / 100;
  const totalCost = totals.totalCostCents / 100;
  const profit = totals.profitCents / 100;
  const margin = safePercent(totals.profitCents, totals.revenueCents);
  const costRatio = safePercent(totals.totalCostCents, totals.revenueCents);
  el("revenue").textContent = money(revenue);
  el("cost-total").textContent = money(totalCost);
  el("profit").textContent = money(profit);
  el("margin").textContent = percent(margin);
  showMarginRating(el("margin-rating"), margin);
  el("profit").classList.toggle("negative", profit < 0);
  el("margin").classList.toggle("negative", profit < 0);
  el("sales-detail").textContent = `${products.length} 条商品记录 · 共 ${totals.quantity.toLocaleString("zh-CN")} 件`;
  el("product-count").textContent = `${products.length} 条商品记录`;
  el("empty-state").hidden = products.length > 0;
  el("total-cost").textContent = `总成本 ${money(totalCost)}`;
  el("status").textContent = !products.length ? "暂无商品" : profit < 0 ? "亏损中" : revenue === 0 ? "无销售额" : profit === 0 ? "收支平衡" : "盈利中";
  el("status").className = `badge${profit < 0 ? " loss" : profit === 0 ? " neutral" : ""}`;
  el("cost-ratio").textContent = percent(costRatio);
  el("profit-ratio").textContent = percent(margin);
  el("cost-bar").style.width = `${costRatio === null ? 0 : Math.min(costRatio, 100)}%`;
  el("profit-bar").style.width = `${margin === null ? 0 : Math.max(margin, 0)}%`;
  el("bar").setAttribute("aria-label", revenue === 0 ? "销售额为零，无法计算收入占比" : `成本占销售额${percent(costRatio)}，利润占销售额${percent(margin)}`);
  el("insight").textContent = !products.length ? "添加第一款商品，开始查看整体经营表现。"
    : revenue === 0 ? `销售额为零，利润率不适用。${profit < 0 ? `当前产生成本 ${money(totalCost)}，形成亏损。` : "当前没有销售收入。"}`
    : profit < 0 ? `整体亏损 ${money(-profit)}。成本已超过销售额，构成条仅显示成本。`
    : profit === 0 ? "当前销售额与总成本相等，处于收支平衡状态。"
    : `共 ${products.length} 条商品记录，贡献 ${money(profit)} 利润。整体利润率按总利润除以总销售额计算。`;
  renderRanking();
  renderBusinessInsights();
}

el("calculator").addEventListener("submit", event => {
  event.preventDefault();
  const item = readProduct();
  if (!item) {
    (Object.values(fields).find(field => field.getAttribute("aria-invalid") === "true") || el("form-error")).focus();
    return;
  }
  const wasEditing = editingId !== null;
  if (wasEditing) {
    const index = products.findIndex(product => product.id === editingId);
    if (index < 0) {
      el("form-error").textContent = "该商品已不存在，请取消修改后重试。";
      return;
    }
    products[index] = { ...item, id: editingId };
  } else {
    // 极端长时间使用时也不让数字 ID 超出安全整数范围。
    if (!Number.isSafeInteger(nextId)) {
      products.forEach((product, index) => { product.id = index + 1; });
      nextId = products.length + 1;
    }
    products.push({ ...item, id: nextId++ });
  }
  finishEditing();
  render();
  saveProducts();
  el("announcement").textContent = `已${wasEditing ? "修改" : "添加"} ${item.product}，共 ${products.length} 条商品记录，排行榜已更新。`;
  fields.product.focus();
});
el("calculator").addEventListener("input", () => {
  // 提交失败后，随输入更新提示；不会更改已添加商品或其汇总。
  if (el("form-error").textContent || Object.values(fields).some(field => field.getAttribute("aria-invalid") === "true")) readProduct();
});
el("reset").addEventListener("click", () => {
  finishEditing();
  for (const [key, value] of Object.entries(defaults)) {
    fields[key].value = value;
    fields[key].setAttribute("aria-invalid", "false");
    el(`${key}-error`).textContent = "";
  }
  el("form-error").textContent = "";
  fields.product.focus();
});
el("cancel-edit").addEventListener("click", () => {
  finishEditing();
  fields.product.focus();
  el("announcement").textContent = "已取消修改，商品数据未改变。";
});
loadProducts();
render();

