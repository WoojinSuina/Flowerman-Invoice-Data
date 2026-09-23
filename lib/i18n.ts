// Bilingual labels for elderly mode (see lib/elderlyMode.ts) — Japanese
// shown large/first, English small underneath as a secondary reference.
// Only covers the screens that mode actually touches so far (navigation,
// login, Jobs); extend this dictionary before using <T k="..."/> for a
// label it doesn't yet have.
export const translations = {
  // Navigation
  dashboard: { ja: "ダッシュボード", en: "Dashboard" },
  review: { ja: "請求書", en: "Invoices" },
  jobs: { ja: "作業", en: "Jobs" },
  stores: { ja: "店舗", en: "Stores" },
  products: { ja: "商品", en: "Products" },
  recommendations: { ja: "提案", en: "Recommendations" },
  reconciliation: { ja: "照合", en: "Reconciliation" },
  logout: { ja: "ログアウト", en: "Log out" },

  // Login
  password: { ja: "パスワード", en: "Password" },
  logIn: { ja: "ログイン", en: "Log in" },
  incorrectPassword: { ja: "パスワードが違います。", en: "Incorrect password." },

  // Jobs list
  uploadAndJobs: { ja: "アップロードと作業", en: "Upload & Jobs" },
  batchJobs: { ja: "バッチ作業", en: "Batch jobs" },
  noUploadsYet: { ja: "まだアップロードがありません。", en: "No uploads yet." },
  file: { ja: "ファイル", en: "File" },
  uploaded: { ja: "アップロード日時", en: "Uploaded" },
  status: { ja: "状態", en: "Status" },
  progress: { ja: "進捗", en: "Progress" },
  passReviewFailed: { ja: "合格 / 要確認 / 失敗", en: "Pass / Review / Failed" },

  // Jobs detail
  backToJobs: { ja: "作業一覧に戻る", en: "Back to jobs" },
  pagesProcessed: { ja: "ページ処理済み", en: "pages processed" },
  invoicesProduced: { ja: "作成された請求書", en: "Invoices produced" },
  noInvoicesProduced: { ja: "作成された請求書はありません。", en: "No invoices produced." },
  page: { ja: "ページ", en: "Page" },
  invoiceNumber: { ja: "請求書番号", en: "Invoice #" },
  date: { ja: "日付", en: "Date" },
  store: { ja: "店舗", en: "Store" },
  totalDue: { ja: "合計金額", en: "Total Due" },
  difference: { ja: "差額", en: "Difference" },
  grandTotal: { ja: "総合計", en: "Grand total" },
  invoice: { ja: "件", en: "invoice" },
  failedPages: { ja: "失敗したページ", en: "Failed pages" },
  scannedImage: { ja: "スキャン画像", en: "Scanned image" },
  error: { ja: "エラー", en: "Error" },
  action: { ja: "操作", en: "Action" },

  // Dashboard
  totalInvoices: { ja: "請求書合計", en: "Total invoices" },
  potentialRevenueNoReturns: { ja: "潜在収益（返品なし）", en: "Potential revenue (no returns)" },
  revenue: { ja: "収益", en: "Revenue" },
  profit: { ja: "利益", en: "Profit" },
  needsReview: { ja: "要確認", en: "Needs review" },
  writeInErrorImpact: { ja: "記入誤差の影響", en: "Write-in error impact" },
  approvedInvoicesSub: { ja: "承認済みの請求書、", en: "approved invoices, " },
  revenueByMonth: { ja: "月別収益", en: "Revenue by month" },
  revenueByWeek: { ja: "週別収益", en: "Revenue by week" },
  topStores: { ja: "上位店舗", en: "Top stores" },
  topProducts: { ja: "上位商品", en: "Top products" },
  noDataYet: { ja: "まだデータがありません。", en: "No data yet." },
  week: { ja: "週", en: "Week" },
  invoicesCount: { ja: "件数", en: "Invoices" },
  delivered: { ja: "配達数", en: "Delivered" },
  sold: { ja: "販売数", en: "Sold" },
  unsold: { ja: "未販売", en: "Unsold" },
  percentSold: { ja: "販売率", en: "% sold" },
  product: { ja: "商品名", en: "Product" },
} as const;

export type TranslationKey = keyof typeof translations;
