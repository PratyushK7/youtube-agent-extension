// content_youtube_captions.js — Runs in MAIN world to access YouTube's player data
// This script can read window.ytInitialPlayerResponse and movie_player.getPlayerResponse()

(function() {
  function getCaptionUrl() {
    var tracks = null;
    try {
      var player = document.getElementById('movie_player');
      if (player && player.getPlayerResponse) {
        var resp = player.getPlayerResponse();
        if (resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer) {
          tracks = resp.captions.playerCaptionsTracklistRenderer.captionTracks;
        }
      }
    } catch(e) {}

    if (!tracks) {
      try {
        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
          tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        }
      } catch(e) {}
    }

    if (tracks && tracks.length > 0) {
      var track = null;
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].languageCode === 'en' && tracks[i].kind !== 'asr') { track = tracks[i]; break; }
      }
      if (!track) {
        for (var i = 0; i < tracks.length; i++) {
          if (tracks[i].languageCode === 'en') { track = tracks[i]; break; }
        }
      }
      if (!track) {
        for (var i = 0; i < tracks.length; i++) {
          if (tracks[i].kind === 'asr') { track = tracks[i]; break; }
        }
      }
      if (!track) track = tracks[0];
      return track.baseUrl || '';
    }
    return '';
  }

  // Write caption URL to a DOM element for the content script to read
  function writeCaptionUrl() {
    var el = document.getElementById('yt-caption-bridge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yt-caption-bridge';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.setAttribute('data-url', getCaptionUrl());
    el.setAttribute('data-ready', 'true');
  }

  // Run immediately and also on navigation
  if (document.readyState === 'complete') {
    setTimeout(writeCaptionUrl, 1000);
  } else {
    window.addEventListener('load', function() { setTimeout(writeCaptionUrl, 1000); });
  }

  // Re-run on YouTube SPA navigation
  var pushState = history.pushState;
  history.pushState = function() {
    pushState.apply(this, arguments);
    setTimeout(writeCaptionUrl, 2000);
  };
  window.addEventListener('yt-navigate-finish', function() {
    setTimeout(writeCaptionUrl, 1500);
  });
})();
