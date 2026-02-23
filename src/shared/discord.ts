export const DISCORD_SNOWFLAKE_REGEX = /^\d{17,20}$/

export const isDiscordSnowflake = (value: string) =>
  DISCORD_SNOWFLAKE_REGEX.test(value)
