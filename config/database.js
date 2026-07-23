const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required (Postgres connection string, e.g. from Neon)');
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      // Neon's certs are valid, but the pooled endpoint's chain isn't always in
      // Node's default trust store depending on environment — this matches Neon's
      // own documented Sequelize setup.
      rejectUnauthorized: false,
    },
  },
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
  },
});

module.exports = sequelize;
