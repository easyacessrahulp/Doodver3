package com.dood.app

import java.time.LocalDate

/** The usual Indian statutory due dates. The government sometimes extends a date, so always check the portal too. */
object Compliance {
    class Item(val id: String, val name: String, val rule: String, private val monthly: Int?, private val yearly: List<Pair<Int, Int>>) {
        /** The next date on or after [from]. */
        fun next(from: LocalDate): LocalDate {
            var best: LocalDate? = null
            if (monthly != null) {
                var d = safe(from.year, from.monthValue, monthly)
                if (d.isBefore(from)) { val n = from.plusMonths(1); d = safe(n.year, n.monthValue, monthly) }
                best = d
            } else {
                for (y in from.year..from.year + 1) for ((m, day) in yearly) {
                    val d = safe(y, m, day)
                    if (!d.isBefore(from) && (best == null || d.isBefore(best))) best = d
                }
            }
            return best!!
        }
        private fun safe(y: Int, m: Int, d: Int): LocalDate = LocalDate.of(y, m, d.coerceAtMost(LocalDate.of(y, m, 1).lengthOfMonth()))
    }

    val all = listOf(
        Item("gstr1", "GSTR-1 (monthly)", "11th of every month", 11, emptyList()),
        Item("gstr3b", "GSTR-3B", "20th of every month", 20, emptyList()),
        Item("tds", "TDS payment", "7th of every month", 7, emptyList()),
        Item("pfesi", "PF and ESI", "15th of every month", 15, emptyList()),
        Item("advtax", "Advance tax", "15 Jun, 15 Sep, 15 Dec, 15 Mar", null, listOf(6 to 15, 9 to 15, 12 to 15, 3 to 15)),
        Item("tdsret", "TDS return (quarterly)", "31 Jul, 31 Oct, 31 Jan, 31 May", null, listOf(7 to 31, 10 to 31, 1 to 31, 5 to 31)),
        Item("taxaudit", "Tax audit report", "30 September", null, listOf(9 to 30)),
        Item("itr", "Income-tax return (non-audit)", "31 July", null, listOf(7 to 31)),
        Item("itraudit", "Income-tax return (audit cases)", "31 October", null, listOf(10 to 31)),
        Item("gstr9", "GSTR-9 annual return", "31 December", null, listOf(12 to 31))
    )
}
