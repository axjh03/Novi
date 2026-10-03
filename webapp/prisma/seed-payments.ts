import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PENDING_PRODUCTS = [
  { name: "Novi Pro Individual (1 Year)", amount: 199, method: "CRYPTO" },
  { name: "Novi Enterprise (5 Seats)", amount: 995, method: "CRYPTO" },
  { name: "Novi Enterprise (10 Seats)", amount: 1990, method: "BANK_TRANSFER" },
  { name: "Novi Team (3 Seats)", amount: 597, method: "CRYPTO" },
  { name: "Novi Pro Individual (6 Months)", amount: 99, method: "CRYPTO" },
  { name: "Novi Enterprise (25 Seats)", amount: 4975, method: "BANK_TRANSFER" },
];

async function main() {
  console.log("💰 Seeding pending payment orders...");

  const tenants = await prisma.tenant.findMany({ take: 5 });
  if (tenants.length === 0) {
    console.error("No tenants found. Run the main seed first.");
    return;
  }

  // Create pending orders
  for (let i = 0; i < PENDING_PRODUCTS.length; i++) {
    const tenant = tenants[i % tenants.length];
    const product = PENDING_PRODUCTS[i];
    
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        productName: product.name,
        amount: product.amount,
        currency: "USD",
        paymentMethod: product.method,
        status: "PENDING",
      },
    });
    console.log(`  Created PENDING: ${product.name} ($${product.amount}) → ${tenant.name}`);
  }

  // Also add some already completed historical orders
  const historicalOrders = [
    { name: "Novi Pro Individual (1 Year)", amount: 199, method: "CRYPTO", status: "COMPLETED" },
    { name: "Novi Enterprise (10 Seats)", amount: 1990, method: "BANK_TRANSFER", status: "COMPLETED" },
    { name: "Novi Team (3 Seats)", amount: 597, method: "CRYPTO", status: "REJECTED" },
    { name: "Novi Pro Individual (1 Year)", amount: 199, method: "CRYPTO", status: "COMPLETED" },
  ];

  for (let i = 0; i < historicalOrders.length; i++) {
    const tenant = tenants[i % tenants.length];
    const product = historicalOrders[i];
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        productName: product.name,
        amount: product.amount,
        currency: "USD",
        paymentMethod: product.method,
        status: product.status,
      },
    });
    console.log(`  Created ${product.status}: ${product.name} → ${tenant.name}`);
  }

  console.log("\n✅ Payment orders seeded! Open Admin Dashboard → Payments to approve/reject.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
