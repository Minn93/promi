declare module "twitter-text" {
  export type TweetParseConfig = {
    version?: number;
    maxWeightedTweetLength: number;
    scale: number;
    defaultWeight: number;
    emojiParsingEnabled?: boolean;
    transformedURLLength: number;
    ranges: Array<{ start: number; end: number; weight: number }>;
  };

  export type ParsedTweet = {
    weightedLength: number;
    valid: boolean;
    permillage: number;
    validRangeStart: number;
    validRangeEnd: number;
    displayRangeStart: number;
    displayRangeEnd: number;
  };

  type TwitterTextApi = {
    parseTweet(text?: string, options?: TweetParseConfig): ParsedTweet;
    configs: { defaults: TweetParseConfig };
  };

  const twitterText: TwitterTextApi;
  export default twitterText;
}
