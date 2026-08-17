import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { name: "Fashion", slug: "fashion", icon: "shirt" },
  { name: "Food", slug: "food", icon: "utensils" },
  { name: "Technology", slug: "technology", icon: "cpu" },
  { name: "Beauty", slug: "beauty", icon: "sparkles" },
  { name: "Art", slug: "art", icon: "palette" },
  { name: "Services", slug: "services", icon: "wrench" },
];

const img = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

/** Shared demo password for every seeded account. */
const DEMO_PASSWORD = "influenz123";

const CREATORS = [
  {
    name: "Luna Rivera",
    email: "luna@influenzhub.com",
    businessName: "Luna Studio",
    category: "Fashion",
    description:
      "Handmade fashion inspired by the colours and craft traditions of the Iberian coast. Every piece is cut and sewn in a two-person studio in Lisbon.",
    location: "Lisbon, Portugal",
    verified: true,
    featured: true,
  },
  {
    name: "Kenji Sato",
    email: "kenji@influenzhub.com",
    businessName: "Kenji Ceramics",
    category: "Art",
    description:
      "Hand-thrown stoneware for everyday use — glazed in small batches, fired in a wood kiln outside Kyoto.",
    location: "Kyoto, Japan",
    verified: true,
    featured: false,
  },
  {
    name: "Amara Okafor",
    email: "amara@influenzhub.com",
    businessName: "Amara Botanicals",
    category: "Beauty",
    description:
      "Plant-based skincare made in small batches with West African botanicals. No filler, no theatre.",
    location: "Lagos, Nigeria",
    verified: false,
    featured: false,
  },
  {
    name: "Diego Fernandez",
    email: "diego@influenzhub.com",
    businessName: "Diego Coffee Roasters",
    category: "Food",
    description:
      "Single-origin coffee roasted weekly, sourced directly from smallholder farms across Huila and Nariño.",
    location: "Bogotá, Colombia",
    verified: true,
    featured: true,
  },
  {
    name: "Priya Nair",
    email: "priya@influenzhub.com",
    businessName: "Priya Codes",
    category: "Technology",
    description:
      "Freelance web development and design systems work for independent brands who care about craft.",
    location: "Bengaluru, India",
    verified: true,
    featured: false,
  },
  {
    name: "Mia Lindqvist",
    email: "mia@influenzhub.com",
    businessName: "Nordic Paper Co.",
    category: "Art",
    description:
      "Letterpress stationery and archival prints, produced on a restored 1960s Heidelberg press.",
    location: "Malmö, Sweden",
    verified: false,
    featured: false,
  },
];

async function main() {
  console.log("Seeding categories…");
  const categories = await Promise.all(
    CATEGORIES.map((c) =>
      prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c })
    )
  );
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  console.log("Seeding admin…");
  await prisma.user.upsert({
    where: { email: "admin@influenzhub.com" },
    create: {
      email: "admin@influenzhub.com",
      name: "Influenz Admin",
      role: "ADMIN",
      emailVerified: new Date(),
      passwordHash,
    },
    update: { role: "ADMIN", passwordHash },
  });

  const profileIds: string[] = [];

  for (const creator of CREATORS) {
    console.log(`Seeding ${creator.businessName}…`);
    const slug = creator.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const user = await prisma.user.upsert({
      where: { email: creator.email },
      create: {
        email: creator.email,
        name: creator.name,
        role: "BUSINESS",
        emailVerified: new Date(),
        image: img(`${slug}-avatar`, 400, 400),
        passwordHash,
      },
      update: { passwordHash },
    });

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessName: creator.businessName,
        slug,
        description: creator.description,
        location: creator.location,
        logo: img(`${slug}-logo`, 400, 400),
        banner: img(`${slug}-banner`, 1600, 600),
        categoryId: categoryByName.get(creator.category)!.id,
        verified: creator.verified,
        featured: creator.featured,
        contactEmail: creator.email,
        socialLinks: { instagram: `https://instagram.com/${slug}` },
      },
      update: {},
    });
    profileIds.push(profile.id);

    const store = await prisma.store.upsert({
      where: { slug: `${slug}-store` },
      create: {
        profileId: profile.id,
        name: `${creator.businessName} Shop`,
        slug: `${slug}-store`,
        description: creator.description,
        location: creator.location,
        categoryId: categoryByName.get(creator.category)!.id,
        images: [img(`${slug}-store-1`), img(`${slug}-store-2`)],
        openingHours: { "Mon–Fri": "9:00–18:00", Saturday: "10:00–15:00", Sunday: "Closed" },
        contactInfo: creator.email,
      },
      update: {},
    });

    for (let i = 1; i <= 4; i++) {
      const productSlug = `${slug}-product-${i}`;
      await prisma.product.upsert({
        where: { slug: productSlug },
        create: {
          storeId: store.id,
          name: `${creator.businessName.split(" ")[0]} Piece No. ${i}`,
          slug: productSlug,
          description: "A signature piece from the current collection, made in a limited run.",
          // XOF, whole francs — a realistic range for handmade goods.
          price: 12_000 + i * 9_500,
          stock: 12 * i,
          categoryId: categoryByName.get(creator.category)!.id,
          images: [img(productSlug, 900, 900)],
        },
        update: {},
      });
    }

    await prisma.service.upsert({
      where: { slug: `${slug}-consulting` },
      create: {
        profileId: profile.id,
        name: `${creator.businessName} Consulting`,
        slug: `${slug}-consulting`,
        description: "One-to-one sessions covering process, sourcing, and building a small brand.",
        priceMin: 35_000,
        priceMax: 150_000,
        categoryId: categoryByName.get("Services")!.id,
        contactMethod: creator.email,
        images: [img(`${slug}-service`)],
      },
      update: {},
    });

    const postCount = await prisma.post.count({ where: { profileId: profile.id } });
    if (postCount === 0) {
      await prisma.post.create({
        data: {
          profileId: profile.id,
          text: `New work just landed at ${creator.businessName}. We spent the last month on this one — come take a look.`,
          images: [img(`${slug}-post`, 1200, 900)],
          storeId: store.id,
        },
      });
    }
  }

  console.log("Seeding a shopper with engagement…");
  const shopper = await prisma.user.upsert({
    where: { email: "shopper@influenzhub.com" },
    create: {
      email: "shopper@influenzhub.com",
      name: "Sam Shopper",
      role: "USER",
      emailVerified: new Date(),
      passwordHash,
    },
    update: { passwordHash },
  });

  for (const targetId of profileIds.slice(0, 4)) {
    await prisma.follow.upsert({
      where: {
        userId_targetType_targetId: { userId: shopper.id, targetType: "PROFILE", targetId },
      },
      create: { userId: shopper.id, targetType: "PROFILE", targetId },
      update: {},
    });
    await prisma.like.upsert({
      where: {
        userId_targetType_targetId: { userId: shopper.id, targetType: "PROFILE", targetId },
      },
      create: { userId: shopper.id, targetType: "PROFILE", targetId },
      update: {},
    });
  }

  console.log(`\nSeed complete. All demo accounts use password: ${DEMO_PASSWORD}`);
  console.log("  admin@influenzhub.com    (ADMIN)");
  console.log("  luna@influenzhub.com     (BUSINESS)");
  console.log("  shopper@influenzhub.com  (USER)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
