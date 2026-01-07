import prisma from '@/lib/prisma';

export async function enrichBillsWithIcons(bills: any[], userId?: string) {
    // 1. Fetch all merchants that have icons (Global)
    const merchants = await prisma.merchant.findMany({
        where: {
            icon: { not: null }
        },
        select: { name: true, icon: true }
    });

    const iconMap = new Map<string, string>();
    merchants.forEach(m => {
        if (m.icon) iconMap.set(m.name, m.icon);
    });

    // 2. Attach icons
    return bills.map(bill => ({
        ...bill,
        payeeIcon: bill.payee ? (iconMap.get(bill.payee) || null) : null,
        payerIcon: bill.payer ? (iconMap.get(bill.payer) || null) : null
    }));
}

export async function enrichBillWithIcons(bill: any, userId?: string) {
    const result = await enrichBillsWithIcons([bill]);
    return result[0];
}
