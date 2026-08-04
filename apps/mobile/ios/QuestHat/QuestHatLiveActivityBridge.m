#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(QuestHatLiveActivity, NSObject)

RCT_EXTERN_METHOD(sync:(NSString *)questId
                  title:(NSString *)title
                  startsAt:(nonnull NSNumber *)startsAt
                  location:(NSString *)location
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPushToStartToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(end:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
