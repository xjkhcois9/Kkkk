(() => {
    "use strict";

    // أسماء المجموعات (collections) في Firestore. نفس الأسماء تُستخدم من waiter.html
    // عند تسجيل بيع تلقائي فور تقديم الطلب، حتى تظهر البيانات فورًا هنا مهما كان الجهاز.
    const COLLECTIONS = {
        sales: "sales",
        mealCosts: "mealCosts",
        salaries: "salaries",
        expenses: "expenses"
    };

    const $ = (selector) => document.querySelector(selector);

    const state = {
        sales: [],
        mealCosts: [],
        salaries: [],
        expenses: []
    };

    const unsubscribers = {};

    // كل مجموعة مرتبطة بمستمع لحظي (onSnapshot): أي عملية تُضاف من أي شاشة
    // (المالية، النادل، ...) على أي جهاز تظهر هنا تلقائيًا بدون الحاجة لتحديث الصفحة.
    function attachListener(key) {
        if (typeof db === "undefined") {
            console.error("Firebase غير مهيأ. تأكد من تحميل إعدادات Firebase قبل finance.js");
            return;
        }
        if (unsubscribers[key]) unsubscribers[key]();

        unsubscribers[key] = db.collection(COLLECTIONS[key]).onSnapshot(snapshot => {
            state[key] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, firebaseId: doc.id }));
            renderAll();
        }, error => {
            console.error(`خطأ في متابعة مجموعة ${COLLECTIONS[key]} من Firebase:`, error);
            showToast("تعذر تحميل البيانات من Firebase. تحقق من الاتصال وقواعد Firestore.");
        });
    }

    function startAllListeners() {
        Object.keys(COLLECTIONS).forEach(attachListener);
    }

    async function refetchAll() {
        try {
            const entries = await Promise.all(
                Object.entries(COLLECTIONS).map(async ([key, collectionName]) => {
                    const snap = await db.collection(collectionName).get();
                    return [key, snap.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, firebaseId: doc.id }))];
                })
            );
            entries.forEach(([key, docs]) => { state[key] = docs; });
            renderAll();
            showToast("تم تحديث البيانات.");
        } catch (error) {
            console.error("خطأ أثناء تحديث البيانات من Firebase:", error);
            showToast("تعذر تحديث البيانات.");
        }
    }

    function id(prefix = "TX") {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function money(value) {
        return `${new Intl.NumberFormat("ar-IQ").format(Math.round(Number(value) || 0))} د.ع`;
    }

    function number(value) {
        return new Intl.NumberFormat("ar-IQ").format(Math.round(Number(value) || 0));
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function parseDate(value) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function startOfDay(date = new Date()) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function startOfWeek(date = new Date()) {
        const d = startOfDay(date);
        // الأسبوع يبدأ يوم السبت في هذا النظام.
        const day = d.getDay(); // 0 الأحد ... 6 السبت
        const daysFromSaturday = (day + 1) % 7;
        d.setDate(d.getDate() - daysFromSaturday);
        return d;
    }

    function startOfMonth(date = new Date()) {
        const d = startOfDay(date);
        d.setDate(1);
        return d;
    }

    function startOfYear(date = new Date()) {
        const d = startOfDay(date);
        d.setMonth(0, 1);
        return d;
    }

    function endOfRange(start, end = new Date()) {
        const startMs = start.getTime();
        const endMs = end.getTime();
        return { startMs, endMs };
    }

    function isInRange(dateValue, start, end = new Date()) {
        const date = parseDate(dateValue);
        if (!date) return false;
        const { startMs, endMs } = endOfRange(start, end);
        return date.getTime() >= startMs && date.getTime() <= endMs;
    }

    function isCompletedSale(sale) {
        return sale && sale.status !== "cancelled" && sale.paymentStatus !== "unpaid";
    }

    function salesInRange(start, end = new Date()) {
        return state.sales.filter(s => isCompletedSale(s) && isInRange(s.date, start, end));
    }

    function sum(items, selector = x => x.amount) {
        return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
    }

    function metrics() {
        const now = new Date();
        const today = salesInRange(startOfDay(now), now);
        const week = salesInRange(startOfWeek(now), now);
        const month = salesInRange(startOfMonth(now), now);

        const totalSales = sum(month);
        const orderCount = month.length;
        const averageOrder = orderCount ? totalSales / orderCount : 0;

        return {
            todaySales: sum(today),
            weekSales: sum(week),
            monthSales: totalSales,
            orderCount,
            averageOrder
        };
    }

    function costsForRange(start, end = new Date()) {
        return {
            mealCosts: sum(state.mealCosts.filter(x => isInRange(x.date, start, end))),
            salaries: sum(state.salaries.filter(x => isInRange(x.date, start, end)), x => x.netSalary),
            expenses: sum(state.expenses.filter(x => isInRange(x.date, start, end)))
        };
    }

    function rangeByKey(key) {
        const now = new Date();
        if (key === "today") return startOfDay(now);
        if (key === "week") return startOfWeek(now);
        if (key === "year") return startOfYear(now);
        return startOfMonth(now);
    }

    function calculateProfit(key) {
        const start = rangeByKey(key);
        const end = new Date();
        const sales = sum(salesInRange(start, end));
        const costs = costsForRange(start, end);
        return {
            sales,
            ...costs,
            net: sales - costs.mealCosts - costs.salaries - costs.expenses
        };
    }

    function renderMetrics() {
        const m = metrics();

        $("#todaySales").textContent = money(m.todaySales);
        $("#weekSales").textContent = money(m.weekSales);
        $("#monthSales").textContent = money(m.monthSales);
        $("#orderCount").textContent = number(m.orderCount);
        $("#averageOrder").textContent = money(m.averageOrder);

        $("#salesTodaySection").textContent = money(m.todaySales);
        $("#salesWeekSection").textContent = money(m.weekSales);
        $("#salesMonthSection").textContent = money(m.monthSales);
        $("#salesOrdersSection").textContent = number(m.orderCount);
        $("#salesAverageSection").textContent = money(m.averageOrder);

        const selectedPeriod = $("#periodFilter").value;
        const profit = calculateProfit(selectedPeriod);

        $("#summarySales").textContent = money(profit.sales);
        $("#summaryMealCosts").textContent = money(profit.mealCosts);
        $("#summarySalaries").textContent = money(profit.salaries);
        $("#summaryExpenses").textContent = money(profit.expenses);
        $("#summaryProfit").textContent = money(profit.net);
        $("#netProfit").textContent = money(profit.net);

        const labels = {
            today: "اليوم",
            week: "هذا الأسبوع",
            month: "هذا الشهر",
            year: "هذه السنة"
        };
        $("#periodSummary").textContent = labels[selectedPeriod];
    }

    function renderSales() {
        const body = $("#salesTableBody");
        const recent = [...state.sales].sort((a,b) => new Date(b.date) - new Date(a.date));

        if (!recent.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty">لا توجد مبيعات مسجلة حاليًا.</td></tr>`;
        } else {
            body.innerHTML = recent.map(sale => `
                <tr>
                    <td><strong>${escapeHTML(sale.id)}</strong></td>
                    <td>#${escapeHTML(sale.orderId || "-")}</td>
                    <td>${formatDate(sale.date)}</td>
                    <td>${escapeHTML(sale.paymentMethod || "نقدي")}</td>
                    <td><strong>${money(sale.amount)}</strong></td>
                    <td><span class="badge ${sale.paymentStatus === "paid" ? "badge-paid" : "badge-pending"}">${sale.paymentStatus === "paid" ? "مدفوع" : "غير مدفوع"}</span></td>
                    <td><button class="danger-btn" data-delete="sales" data-id="${escapeHTML(sale.id)}">حذف</button></td>
                </tr>
            `).join("");
        }

        const recentBody = $("#recentSalesBody");
        const latest = recent.slice(0, 8);
        recentBody.innerHTML = latest.length ? latest.map(sale => `
            <tr>
                <td>#${escapeHTML(sale.orderId || sale.id)}</td>
                <td>${formatDate(sale.date)}</td>
                <td>${escapeHTML(sale.paymentMethod || "نقدي")}</td>
                <td><strong>${money(sale.amount)}</strong></td>
            </tr>
        `).join("") : `<tr><td colspan="4" class="empty">لا توجد مبيعات.</td></tr>`;
    }

    function renderCosts() {
        renderSimpleTable("#mealCostsBody", state.mealCosts, item => `
            <td>${formatDate(item.date, false)}</td>
            <td>${escapeHTML(item.meal)}</td>
            <td>${escapeHTML(item.description || "-")}</td>
            <td><strong>${money(item.amount)}</strong></td>
        `, "mealCosts");

        renderSimpleTable("#salariesBody", state.salaries, item => `
            <td>${formatDate(item.date, false)}</td>
            <td>${escapeHTML(item.employee)}</td>
            <td>${escapeHTML(item.role)}</td>
            <td><strong>${money(item.netSalary)}</strong></td>
        `, "salaries");

        renderSimpleTable("#expensesBody", state.expenses, item => `
            <td>${formatDate(item.date, false)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${escapeHTML(item.description)}</td>
            <td><strong>${money(item.amount)}</strong></td>
        `, "expenses");
    }

    function renderSimpleTable(selector, data, columns, type) {
        const body = $(selector);
        const rows = [...data].sort((a,b) => new Date(b.date) - new Date(a.date));
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty">لا توجد بيانات مسجلة.</td></tr>`;
            return;
        }
        body.innerHTML = rows.map(item => `
            <tr>
                ${columns(item)}
                <td><button class="danger-btn" data-delete="${type}" data-id="${escapeHTML(item.id)}">حذف</button></td>
            </tr>
        `).join("");
    }

    function renderProfit() {
        const p = calculateProfit($("#profitPeriod").value);
        $("#profitSales").textContent = money(p.sales);
        $("#profitMealCosts").textContent = money(p.mealCosts);
        $("#profitSalaries").textContent = money(p.salaries);
        $("#profitExpenses").textContent = money(p.expenses);
        $("#profitNet").textContent = money(p.net);
    }

    function renderAll() {
        renderMetrics();
        renderSales();
        renderCosts();
        renderProfit();
    }

    function formatDate(value, includeTime = true) {
        const date = parseDate(value);
        if (!date) return "-";
        return new Intl.DateTimeFormat("ar-IQ", includeTime ? {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
        } : {
            year: "numeric", month: "2-digit", day: "2-digit"
        }).format(date);
    }

    function showToast(message) {
        const toast = $("#toast");
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
    }

    function showSection(section) {
        document.querySelectorAll(".nav-item").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.section === section);
        });

        document.querySelectorAll(".page-section").forEach(page => {
            page.classList.remove("active");
        });

        const target = $(`#${section === "dashboard" ? "dashboard" : section}Section`);
        if (target) target.classList.add("active");

        const titles = {
            dashboard: ["لوحة الحسابات والمالية", "متابعة الإيرادات والتكاليف والأرباح"],
            sales: ["المبيعات", "الإيرادات الناتجة عن الطلبات"],
            "meal-costs": ["تكلفة الوجبات", "تكلفة المواد المستخدمة في إنتاج الوجبات"],
            salaries: ["تكلفة الرواتب", "الرواتب والمكافآت والخصومات"],
            expenses: ["التكاليف الأخرى", "المصاريف التشغيلية الأخرى"],
            profits: ["صافي الأرباح", "النتيجة المالية بعد خصم التكاليف"]
        };

        $("#pageTitle").textContent = titles[section][0];
        $("#pageSubtitle").textContent = titles[section][1];
    }

    function openModal(type) {
        const config = {
            sale: {
                title: "تسجيل بيع",
                description: "يمكن استخدام هذا النموذج للاختبار أو تسجيل مبيعات لا تأتي من شاشة الطلب.",
                fields: `
                    <div class="form-grid">
                        <div class="field"><label>رقم الطلب</label><input id="fieldOrderId" required placeholder="مثال: 1025"></div>
                        <div class="field"><label>المبلغ (د.ع)</label><input id="fieldAmount" type="number" min="0" step="1" required></div>
                        <div class="field"><label>طريقة الدفع</label><select id="fieldPayment"><option>نقدي</option><option>بطاقة</option><option>تحويل</option></select></div>
                        <div class="field"><label>الحالة</label><select id="fieldPaymentStatus"><option value="paid">مدفوع</option><option value="unpaid">غير مدفوع</option></select></div>
                    </div>
                `
            },
            mealCost: {
                title: "إضافة تكلفة وجبة",
                description: "سجل تكلفة المواد المستخدمة في إنتاج وجبة.",
                fields: `
                    <div class="form-grid">
                        <div class="field"><label>الوجبة</label><input id="fieldMeal" required></div>
                        <div class="field"><label>المبلغ (د.ع)</label><input id="fieldAmount" type="number" min="0" required></div>
                        <div class="field full"><label>الوصف</label><input id="fieldDescription" placeholder="مثال: لحم + خبز + جبن"></div>
                    </div>
                `
            },
            salary: {
                title: "إضافة راتب",
                description: "سجل صافي الراتب المدفوع أو المستحق.",
                fields: `
                    <div class="form-grid">
                        <div class="field"><label>اسم الموظف</label><input id="fieldEmployee" required></div>
                        <div class="field"><label>الوظيفة</label><input id="fieldRole" required></div>
                        <div class="field"><label>الراتب الأساسي</label><input id="fieldBasic" type="number" min="0" required></div>
                        <div class="field"><label>المكافآت</label><input id="fieldBonus" type="number" min="0" value="0"></div>
                        <div class="field"><label>الخصومات</label><input id="fieldDeduction" type="number" min="0" value="0"></div>
                    </div>
                `
            },
            expense: {
                title: "إضافة تكلفة أخرى",
                description: "أضف مصروفًا تشغيليًا غير متعلق بتكلفة الوجبات أو الرواتب.",
                fields: `
                    <div class="form-grid">
                        <div class="field"><label>التصنيف</label><select id="fieldCategory"><option>إيجار</option><option>كهرباء</option><option>ماء</option><option>غاز</option><option>صيانة</option><option>تسويق</option><option>نقل</option><option>تنظيف</option><option>أخرى</option></select></div>
                        <div class="field"><label>المبلغ (د.ع)</label><input id="fieldAmount" type="number" min="0" required></div>
                        <div class="field full"><label>الوصف</label><input id="fieldDescription" required placeholder="وصف المصروف"></div>
                    </div>
                `
            }
        };

        const c = config[type];
        $("#transactionType").value = type;
        $("#modalTitle").textContent = c.title;
        $("#modalDescription").textContent = c.description;
        $("#dynamicFields").innerHTML = c.fields;
        $("#modal").classList.remove("hidden");
    }

    function closeModal() {
        $("#modal").classList.add("hidden");
        $("#transactionForm").reset();
        $("#dynamicFields").innerHTML = "";
    }

    async function submitTransaction(event) {
        event.preventDefault();

        const type = $("#transactionType").value;
        const now = new Date().toISOString();
        const submitBtn = event.target.querySelector('button[type="submit"]');

        let key, docId, data;

        if (type === "sale") {
            const amount = Number($("#fieldAmount").value);
            if (!(amount > 0)) return showToast("أدخل مبلغًا صحيحًا.");
            key = "sales";
            docId = id("SALE");
            data = {
                id: docId,
                orderId: $("#fieldOrderId").value.trim(),
                amount,
                paymentMethod: $("#fieldPayment").value,
                paymentStatus: $("#fieldPaymentStatus").value,
                status: "completed",
                date: now
            };
        }

        if (type === "mealCost") {
            const amount = Number($("#fieldAmount").value);
            if (!(amount >= 0)) return showToast("أدخل تكلفة صحيحة.");
            key = "mealCosts";
            docId = id("MC");
            data = {
                id: docId,
                meal: $("#fieldMeal").value.trim(),
                description: $("#fieldDescription").value.trim(),
                amount,
                date: now
            };
        }

        if (type === "salary") {
            const basic = Number($("#fieldBasic").value) || 0;
            const bonus = Number($("#fieldBonus").value) || 0;
            const deduction = Number($("#fieldDeduction").value) || 0;
            const netSalary = Math.max(0, basic + bonus - deduction);
            key = "salaries";
            docId = id("SAL");
            data = {
                id: docId,
                employee: $("#fieldEmployee").value.trim(),
                role: $("#fieldRole").value.trim(),
                basic,
                bonus,
                deduction,
                netSalary,
                date: now
            };
        }

        if (type === "expense") {
            const amount = Number($("#fieldAmount").value);
            if (!(amount >= 0)) return showToast("أدخل مبلغًا صحيحًا.");
            key = "expenses";
            docId = id("EXP");
            data = {
                id: docId,
                category: $("#fieldCategory").value,
                description: $("#fieldDescription").value.trim(),
                amount,
                date: now
            };
        }

        if (!key) return;

        if (submitBtn) submitBtn.disabled = true;
        try {
            await db.collection(COLLECTIONS[key]).doc(docId).set({
                ...data,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast("تم حفظ العملية في قاعدة البيانات.");
            closeModal();
        } catch (error) {
            console.error("Firebase Error:", error);
            showToast("تعذر حفظ العملية. تحقق من الاتصال بالإنترنت.");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function deleteItem(type, itemId) {
        if (!confirm("هل تريد حذف هذه العملية؟")) return;

        try {
            await db.collection(COLLECTIONS[type]).doc(itemId).delete();
            showToast("تم حذف العملية.");
        } catch (error) {
            console.error("Firebase delete error:", error);
            showToast("تعذر حذف العملية من قاعدة البيانات.");
        }
    }

    function bindEvents() {
        document.querySelectorAll(".nav-item").forEach(btn => {
            btn.addEventListener("click", () => showSection(btn.dataset.section));
        });

        document.querySelectorAll("[data-open-form]").forEach(btn => {
            btn.addEventListener("click", () => openModal(btn.dataset.openForm));
        });

        $("#addTransactionBtn").addEventListener("click", () => openModal("sale"));
        $("#refreshBtn").addEventListener("click", refetchAll);

        $("#periodFilter").addEventListener("change", renderAll);
        $("#profitPeriod").addEventListener("change", renderProfit);

        $("#closeModal").addEventListener("click", closeModal);
        $("#cancelModal").addEventListener("click", closeModal);
        $("#transactionForm").addEventListener("submit", submitTransaction);

        document.addEventListener("click", event => {
            const button = event.target.closest("[data-delete]");
            if (!button) return;
            deleteItem(button.dataset.delete, button.dataset.id);
        });

        $("#modal").addEventListener("click", event => {
            if (event.target === $("#modal")) closeModal();
        });
    }

    // واجهة تكامل مع نظام الطلبات الحالي (تُستخدم مباشرة من waiter.html عبر Firestore
    // أيضًا، لكن تبقى متاحة هنا لأي صفحة تحمّل finance.js نفسه، مثل الاختبار المحلي).
    window.RestaurantFinance = {
        async recordSale({ orderId, amount, paymentMethod = "نقدي", date = new Date().toISOString() }) {
            const docId = id("SALE");
            const sale = {
                id: docId,
                orderId: String(orderId ?? ""),
                amount: Number(amount) || 0,
                paymentMethod,
                paymentStatus: "paid",
                status: "completed",
                date
            };
            await db.collection(COLLECTIONS.sales).doc(docId).set({
                ...sale,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return sale;
        },
        getMetrics: metrics,
        getProfit: calculateProfit
    };

    window.addEventListener("beforeunload", () => {
        Object.values(unsubscribers).forEach(unsub => unsub && unsub());
    });

    bindEvents();
    renderAll();
    startAllListeners();
})();
