import { Schema, model } from 'mongoose';

/*
 * The one settings document, edited from the admin panel. Anything left unset falls back to the .env value, so a fresh install
 * behaves exactly as before. `toggles` switch whole services off (buying only: deposits still credit); `disabledServers` switch single servers off.
 */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    rates: {
      usdNgnRate: Number,
      eurUsdRate: Number,
      numberMarkupPercent: Number,
      boostMarkupPercent: Number,
      esimMarkupPercent: Number,
      rentalMarkupPercent: Number,
      telegramMarkupPercent: Number,
    },
    toggles: {
      numbers: { type: Boolean, default: true },
      boost: { type: Boolean, default: true },
      esim: { type: Boolean, default: true },
      rentals: { type: Boolean, default: true },
      telegram: { type: Boolean, default: true },
      deposits: { type: Boolean, default: true },
    },
    disabledServers: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Settings = model('Settings', settingsSchema);
