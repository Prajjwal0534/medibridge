'use strict';

// No credentials belong in this public file. Video stays disabled until a
// contracted/reviewed provider is configured and the review identifier is
// recorded. Public meet.jit.si must not be enabled for real healthcare data.
window.MEDIBRIDGE_VIDEO_CONFIG=Object.freeze({
  enabled:false,
  provider:'disabled',
  externalApiUrl:'',
  conferenceHost:'',
  privacyReviewId:'',
  syntheticDemoOnly:true
});
