import { loadChatList } from './dm-chat-list.js';
import { restoreDraft } from './send-message.js';
import { renderMessage, renderReactions, renderEmptyWelcome, updateReactions, renderSystem } from './ui.js';
import { scrollBottom, getProfile, getDisplayName } from './helpers.js';
import { playSound, confetti } from './sounds.js';
import { setConnected } from './connection.js';
import { buildFeelingsGrid, renderTheirFeeling, playPulseAnimation } from './extras-games.js';
import { saveMessageToOfflineDB, saveMessagesHistoryToOfflineDB, clearRoomHistoryInOfflineDB, flushOfflineQueue } from './offline.js';
import { applyReadReceipts } from './read-receipts.js';
import { updateBestieHeaderState, updateStreak, updateUnreadBadge, clearUnread, updateCountdown, sendDesktopNotification, updatePinnedBanner, startIntervals } from './ui-updates.js';
import { renderDiaryList, renderCalendarList, renderBucketList, renderGlossaryList, refreshMessagesLayout, renderHeatmap, fetchWeatherForCity, renderBonsai, openCoDraw, closeCoDraw, drawCoDrawStrokeLocal, clearCoDraw, syncWatchTogetherPlayer, handleTTTMoveLocal, triggerHapticPulseLocal, triggerScreenNudge, triggerEmojiReactionBurst, showToast, renderDailyQuestionCard, fetchDailyQuestion, updateScoreboardDisplay, updateE2EEFingerprint, dropConnect4Token } from './ultimate-features.js';
import { startCallTimer, endCall } from './webrtc.js';

  // ═══════════════════ SOCKET.IO ═══════════════════
  export function initSocket() {
    if (socket) return;
    if (typeof io === 'undefined') {
      console.error('Socket.io library not loaded. Is the server running?');
      setConnected(false);
      els.loginError.textContent = 'Cannot connect to server. Is the server running?';
      return;
    }
    socket = io({ 
      reconnection: true, reconnectionAttempts: Infinity,
      auth: { token: authToken }
    });
    let _reconnectDelay = 1000;
    socket.io.on('reconnect_attempt', () => {
      _reconnectDelay = Math.min(_reconnectDelay * 2, 16000);
      socket.io.opts.reconnectionDelay = _reconnectDelay;
    });
    socket.io.on('reconnect', () => { _reconnectDelay = 1000; });

    socket.on('connect', () => {
      setConnected(true);
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'none';
      if (joined || (myName && myRoom)) doSocketJoin();
      flushOfflineQueue();
      flushOutboxQueue();
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect_error:', err && err.message);
      setConnected(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      const banner = document.getElementById('offlineBanner');
      if (banner && joined && !navigator.onLine) banner.style.display = 'flex';
      else if (banner) banner.style.display = 'none';
    });

    socket.on('join-error', (msg) => {
      if (els.loginError) els.loginError.textContent = msg;
      joined = false;
      // Override !important inline styles via setAttribute
      if (els.chat) els.chat.setAttribute('style', 'display:none !important');
      if (els.login) els.login.setAttribute('style', 'display:flex !important; flex-direction:column; align-items:center;');
    });

    socket.on('joined', (payload) => {
      joined = true;
      myProfile = payload.profile || {};
      allImageMessages = [];
      if (els.login) els.login.setAttribute('style', 'display:none !important;');
      if (els.chat) els.chat.setAttribute('style', 'display:flex !important;');
      if (els.motdBanner) {
        if (payload.motd && payload.motd.trim()) {
          els.motdBanner.textContent = `✨ ${payload.motd.trim()}`;
          els.motdBanner.style.display = 'block';
        } else {
          els.motdBanner.textContent = '';
          els.motdBanner.style.display = 'none';
        }
      }
      if (els.moodInput) els.moodInput.value  = payload.mood  || '';
      if (els.jokesInput) els.jokesInput.value = (payload.jokes || []).join('\n');
      if (payload.weatherCity) {
        localStorage.setItem('bestieWeatherCity', payload.weatherCity);
        const cityInput = document.getElementById('weatherCityInput');
        if (cityInput) cityInput.value = payload.weatherCity;
        fetchWeatherForCity(payload.weatherCity);
      }
      if (payload.countdown) {
        if (els.countdownLabel) els.countdownLabel.value = payload.countdown.label || '';
        if (els.countdownDate) els.countdownDate.value  = payload.countdown.date ? payload.countdown.date.slice(0, 16) : '';
        updateCountdown(payload.countdown);
      }
      currentStreakDays = (payload.streak && payload.streak.days) || 0;
      updateStreak(payload.streak);
      updateBestieHeaderState(null, payload.lastSeen);

      feelingsPalette = payload.feelingsPalette || {};
      feelings        = payload.feelings        || {};
      myFeelingKey    = feelings[myName] ? feelings[myName].key : null;
      buildFeelingsGrid();
      renderTheirFeeling();

      // Pre-populate profiles
      (payload.history || []).forEach((m) => { if (m.user) profiles[m.user] = profiles[m.user] || {}; });

      allMessagesCached = payload.history || [];
      clearRoomHistoryInOfflineDB(myRoom).then(() => {
        saveMessagesHistoryToOfflineDB(allMessagesCached);
      });
      if (els.messages) els.messages.innerHTML = '';
      lastDateLabel = '';
      if (!allMessagesCached || allMessagesCached.length === 0) {
        renderEmptyWelcome();
      } else {
        allMessagesCached.forEach((m) => renderMessage(m, true));
      }
      if (els.msgInput) els.msgInput.focus();
      restoreDraft();
      startIntervals();
      clearUnread();
      setTimeout(confetti, 300);

      // Restore pinned message
      updatePinnedBanner(payload.pinnedMsg || null);

      // Restore read receipts
      applyReadReceipts(payload.readBy || {});

      // Restore nickname in chat extras panel
      const savedNick = localStorage.getItem('bestieChatNickname') || '';
      if (els.nicknameInputChat) els.nicknameInputChat.value = savedNick;

      // Restore notebook states
      sharedDiary = payload.diary || [];
      renderDiaryList(sharedDiary);
      sharedBucketList = payload.bucketList || [];
      renderBucketList(sharedBucketList);
      sharedCalendar = payload.calendar || [];
      renderCalendarList(sharedCalendar);
      sharedGlossary = payload.glossary || [];
      renderGlossaryList(sharedGlossary);
      sharedBonsai = payload.bonsai || { growth: 0, lastWatered: null };
      renderBonsai(sharedBonsai);
      renderHeatmap();

      // Premium dashboard features
      if (payload.dailyQuestionState) renderDailyQuestionCard(payload.dailyQuestionState);
      else fetchDailyQuestion();
      updateScoreboardDisplay(payload.gameScores || { wins: {}, losses: {} });
      updateE2EEFingerprint();
      flushOutboxQueue();
    });

    socket.on('daily-answer-update', (state) => {
      renderDailyQuestionCard(state);
      if (state && state.revealed) {
        confetti();
        playSound('milestone');
      }
    });

    socket.on('message', (msg) => {
      if (msg.clientMsgId) {
        const pendingWrap = document.querySelector(`.msg-wrap[data-id="${msg.clientMsgId}"]`);
        if (pendingWrap) {
          pendingWrap.dataset.id = msg.id;
          pendingWrap.classList.remove('is-pending');
          const pendingTick = pendingWrap.querySelector('.msg-status-ticks');
          if (pendingTick) {
            pendingTick.id = `tick-${msg.id}`;
            pendingTick.className = 'msg-status-ticks sent';
            pendingTick.innerHTML = `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M12.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.3 8.35a.96.96 0 010-1.34.93.93 0 011.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`;
          }
          outboxQueue = outboxQueue.filter(item => item.clientMsgId !== msg.clientMsgId);
          saveOutboxQueue();
          allMessagesCached.push(msg);
          saveMessageToOfflineDB(msg);
          renderHeatmap();
          return;
        }
      }

      allMessagesCached.push(msg);
      saveMessageToOfflineDB(msg);
      renderMessage(msg);
      renderHeatmap();
      if (msg.user !== myName) {
        if (document.hidden) {
          unreadCount++;
          updateUnreadBadge();
          sendDesktopNotification(getDisplayName(msg.user), {
            body: msg.type === 'hug'   ? 'sent you a hug 💌'   :
                  msg.type === 'image' ? 'sent a photo 📸'      :
                  msg.type === 'media-group' ? 'sent photos 📸' :
                  msg.type === 'document' ? `sent a document: ${msg.docName || ''} 📄` :
                  msg.type === 'voice' ? 'sent a voice note 🎤' :
                  (msg.text || 'New message'),
            icon: '/icon-192.png'
          });
          socket.emit('mark-delivered', { messageId: msg.id });
        }
      } else {
        localStorage.setItem('bestieLastMsgDate', new Date().toISOString().slice(0, 10));
      }
    });

    socket.on('message-ack', ({ clientMsgId, id }) => {
      if (clientMsgId) {
        const pendingWrap = document.querySelector(`.msg-wrap[data-id="${clientMsgId}"]`);
        if (pendingWrap) {
          pendingWrap.dataset.id = id;
          pendingWrap.classList.remove('is-pending');
          const pendingTick = pendingWrap.querySelector('.msg-status-ticks');
          if (pendingTick) {
            pendingTick.id = `tick-${id}`;
            pendingTick.className = 'msg-status-ticks sent';
            pendingTick.innerHTML = `<svg viewBox="0 0 16 15" width="14" height="13" fill="none"><path d="M12.01 3.316l-7.92 8.56a.91.91 0 01-.67.3.91.91 0 01-.67-.3L.3 8.35a.96.96 0 010-1.34.93.93 0 01.33 0l2.79 2.99 7.26-7.85a.93.93 0 011.33 0 .96.96 0 010 1.166z" fill="currentColor"/></svg>`;
          }
        }
        outboxQueue = outboxQueue.filter(item => item.clientMsgId !== clientMsgId);
        saveOutboxQueue();
      }
    });

    function rejectPendingMessage(clientMsgId, reason) {
      const pendingWrap = document.querySelector(`.msg-wrap[data-id="${clientMsgId}"]`);
      if (pendingWrap) {
        pendingWrap.classList.add('msg-failed');
        const statusText = pendingWrap.querySelector('.msg-status-text');
        if (statusText) statusText.textContent = reason || 'Failed to send';
        setTimeout(() => pendingWrap.remove(), 3000);
      }
      outboxQueue = outboxQueue.filter(item => item.clientMsgId !== clientMsgId);
      saveOutboxQueue();
    }

    socket.on('rate-limited', ({ message }) => {
      if (outboxQueue.length > 0) {
        rejectPendingMessage(outboxQueue[outboxQueue.length - 1].clientMsgId, message || 'Slow down!');
      }
    });

    socket.on('message-error', ({ clientMsgId, error }) => {
      rejectPendingMessage(clientMsgId, error || 'Failed to send');
    });

    socket.on('view-once-opened', ({ messageId }) => {
      const capsule = document.querySelector(`.msg-wrap[data-id="${messageId}"] .view-once-capsule`);
      if (capsule) {
        capsule.classList.add('opened');
        capsule.onclick = null;
        capsule.innerHTML = `<span class="view-once-num">1</span><span>Photo (Opened)</span>`;
      }
      const m = allMessagesCached.find(item => item.id === messageId);
      if (m) { m.opened = true; m.url = ''; }
    });

    socket.on('messages-read', ({ messageIds }) => {
      (messageIds || []).forEach(id => {
        const tick = document.getElementById(`tick-${id}`);
        if (tick) {
          tick.textContent = '✓✓';
          tick.className = 'read-tick read';
        }
      });
    });

    socket.on('message-delivered', ({ messageId }) => {
      const tick = document.getElementById(`tick-${messageId}`);
      if (tick && !tick.classList.contains('read')) {
        tick.textContent = '✓✓';
        tick.className = 'read-tick delivered';
      }
    });

    socket.on('message-edited', ({ messageId, text, editedAt }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.text = text;
        msg.editedAt = editedAt;
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      const textEl = msgEl.querySelector('.msg-text') || null;
      if (textEl) { textEl.textContent = text; }
      let editTag = msgEl.querySelector('.edited-tag');
      if (!editTag) { editTag = document.createElement('div'); editTag.className = 'edited-tag'; msgEl.appendChild(editTag); }
      editTag.textContent = 'edited';
    });

    socket.on('message-deleted', ({ messageId }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.deleted = true;
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      const msgEl = wrap.querySelector('.msg');
      if (!msgEl) return;
      msgEl.className = `msg deleted ${msgEl.classList.contains('me') ? 'me' : 'them'}`;
      msgEl.innerHTML = '🗑️ Message deleted';
      wrap.querySelector('.react-bar')?.remove();
      wrap.querySelector('.reactions')?.remove();
    });

    socket.on('system',       renderSystem);
    socket.on('milestone',    renderMilestone);
    socket.on('game-prompt',  renderGamePrompt);

    socket.on('reaction-update', ({ messageId, reactions }) => updateReactions(messageId, reactions));

    socket.on('poll-update', ({ messageId, votes }) => {
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (!wrap) return;
      wrap.querySelectorAll('.poll-opt').forEach((btn) => {
        btn.classList.toggle('voted', votes[myName] === btn.dataset.option);
      });
    });

    socket.on('streak-update', (streak) => { currentStreakDays = (streak && streak.days) || 0; updateStreak(streak); confetti(); });

    socket.on('presence', ({ users, profiles: profs, lastSeen }) => {
      (profs || []).forEach((p) => { profiles[p.name] = p; });
      updateBestieHeaderState(users, lastSeen);
    });

    socket.on('global-presence', ({ lastSeen }) => {
      if (lastSeen) {
        lastSeenData = { ...lastSeenData, ...lastSeen };
        updateBestieHeaderState(null, lastSeenData);
      }
    });

    socket.on('chat-list-update', () => {
      loadChatList();
    });

    socket.on('presence-status-update', ({ user, status }) => {
      if (user === myName) return;
      const hStatusEl = document.getElementById('headerBestieStatus');
      const bStatusEl = els.bestieStatus;
      if (!hStatusEl && !bStatusEl) return;
      
      let text = 'Online';
      if (status === 'typing') text = 'typing…';
      else if (status === 'recording-audio') text = 'recording audio…';
      else if (status === 'recording-video') text = 'recording video note…';
      else if (status === 'uploading-media') text = 'sending photo…';
      
      if (hStatusEl) {
        hStatusEl.textContent = text;
        hStatusEl.classList.add('online');
      }
      if (bStatusEl) {
        bStatusEl.textContent = text;
        bStatusEl.classList.add('online');
      }
    });

    socket.on('message-starred', ({ messageId, starredBy }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.starredBy = starredBy || [];
        saveMessageToOfflineDB(msg);
      }
      const wrap = els.messages.querySelector(`[data-id="${messageId}"]`);
      if (wrap) {
        let badge = wrap.querySelector('.msg-star-badge');
        const isStarred = (starredBy || []).includes(myName);
        if (isStarred && !badge) {
          badge = document.createElement('span');
          badge.className = 'msg-star-badge';
          badge.title = 'Starred';
          badge.textContent = '⭐';
          const tickContainer = wrap.querySelector('div:last-child');
          if (tickContainer) tickContainer.prepend(badge);
        } else if (!isStarred && badge) {
          badge.remove();
        }
      }
    });

    socket.on('typing', (name) => {
      if (name === getDisplayName(myName) || name === myName) return;
      // Show animated typing bubble
      let bubble = document.getElementById('typingBubble');
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typingBubble';
        bubble.className = 'typing-bubble';
        bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        els.messages.appendChild(bubble);
      }
      bubble.style.display = 'flex';
      scrollBottom();
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (bubble) bubble.style.display = 'none';
        updateBestieHeaderState();
      }, 2500);
    });

    socket.on('feelings-update', (updated) => {
      feelings = updated || {};
      myFeelingKey = feelings[myName] ? feelings[myName].key : myFeelingKey;
      buildFeelingsGrid();
      renderTheirFeeling();
    });

    socket.on('empathy-pulse', (data) => {
      if (!data) return;
      if (data.from === getDisplayName(myName) || data.from === myName) return;
      playPulseAnimation(data.from);
      sendDesktopNotification(`${data.from} 💓`, { body: 'sent you an empathy pulse', icon: '/icon-192.png' });
    });

    socket.on('mood-update',      (mood)  => { if (els.moodInput) els.moodInput.value = mood || ''; });
    socket.on('jokes-update',     (jokes) => { if (els.jokesInput) els.jokesInput.value = (jokes || []).join('\n'); });
    socket.on('weather-update',   (city)  => {
      localStorage.setItem('bestieWeatherCity', city);
      const cityInput = document.getElementById('weatherCityInput');
      if (cityInput) cityInput.value = city || '';
      if (city) fetchWeatherForCity(city);
    });
    socket.on('countdown-update', (cd)    => {
      if (!cd) return;
      if (els.countdownLabel) els.countdownLabel.value = cd.label || '';
      if (els.countdownDate)  els.countdownDate.value  = cd.date ? cd.date.slice(0, 16) : '';
      updateCountdown(cd);
    });

    socket.on('pinned-update', ({ _messageId, msg }) => {
      updatePinnedBanner(msg || null);
    });

    socket.on('pad-updated', ({ text }) => {
      const pad = document.getElementById('sharedPadInput');
      if (pad && document.activeElement !== pad) pad.value = text || '';
    });

    socket.on('receipt-update', (rb) => { applyReadReceipts(rb); });

    // WebRTC calling signaling listeners
    socket.on('call-invite', ({ from, offer, type, callerSocketId }) => {
      webrtcCallOffer = offer;
      callType = type;
      callPartner = from;
      callPartnerSocketId = callerSocketId || null;

      const overlay = document.getElementById('callOverlay');
      const incomingControls = document.getElementById('incomingControls');
      const activeControls = document.getElementById('activeCallControls');
      const statusText = document.getElementById('callStatusText');
      const callAvatar = document.getElementById('callAvatar');
      const callName = document.getElementById('callName');
      const audioView = document.getElementById('callAudioView');
      const videoGrid = document.getElementById('videoGrid');
      const flipCamBtn = document.getElementById('flipCamBtn');
      const audioWaves = document.getElementById('callAudioWaves');

      if (overlay) overlay.style.display = 'flex';
      if (incomingControls) incomingControls.style.display = 'flex';
      if (activeControls) activeControls.style.display = 'none';
      if (statusText) statusText.textContent = `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call…`;
      if (audioWaves) audioWaves.style.display = 'none';

      const p = getProfile(from);
      if (callAvatar) callAvatar.textContent = p.avatar || '🐱';
      if (callName) callName.textContent = p.nickname ? `${p.nickname} (@${from})` : `@${from}`;

      if (type === 'video') {
        if (audioView) audioView.style.display = 'none';
        if (videoGrid) videoGrid.style.display = 'block';
        if (flipCamBtn) flipCamBtn.style.display = 'flex';
      } else {
        if (audioView) audioView.style.display = 'flex';
        if (videoGrid) videoGrid.style.display = 'none';
        if (flipCamBtn) flipCamBtn.style.display = 'none';
      }

      if (navigator.vibrate) navigator.vibrate([300, 500, 300, 500, 300]);
      playSound('receive');
    });

    socket.on('call-accept', ({ answer, calleeSocketId }) => {
      if (calleeSocketId) callPartnerSocketId = calleeSocketId;
      if (webrtcConn) {
        webrtcConn.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
        const statusText = document.getElementById('callStatusText');
        const audioWaves = document.getElementById('callAudioWaves');
        if (statusText) statusText.textContent = 'Connected 🟢';
        if (audioWaves) audioWaves.style.display = 'flex';
        startCallTimer();
      }
    });

    socket.on('call-decline', () => {
      renderSystem('Call declined by bestie');
      endCall(true);
    });

    socket.on('call-candidate', ({ candidate }) => {
      if (webrtcConn && candidate) {
        webrtcConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    socket.on('call-hangup', () => {
      renderSystem('Call ended');
      endCall(true);
    });

    socket.on('diary-update', (diary) => {
      sharedDiary = diary;
      renderDiaryList(diary);
    });

    socket.on('bucketlist-update', (list) => {
      sharedBucketList = list;
      renderBucketList(list);
    });

    socket.on('glossary-update', (words) => {
      sharedGlossary = words;
      renderGlossaryList(words);
      refreshMessagesLayout();
    });

    socket.on('bonsai-update', (state) => {
      sharedBonsai = state;
      renderBonsai(state);
    });

    socket.on('draw-stroke', (data) => {
      drawCoDrawStrokeLocal(data);
    });

    socket.on('draw-clear', () => {
      clearCoDraw(false);
    });

    socket.on('watch-sync', (data) => {
      syncWatchTogetherPlayer(data);
    });

    socket.on('game-move', (data) => {
      handleTTTMoveLocal(data);
    });

    socket.on('nudge', (data) => {
      triggerScreenNudge(data.from);
    });

    socket.on('haptic-touch', (data) => {
      if (data.from !== myName) {
        triggerHapticPulseLocal();
      }
    });

    socket.on('reaction-update', ({ messageId, reactions }) => {
      const msg = allMessagesCached.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = reactions;
        const lastReact = Object.keys(reactions).pop();
        if (lastReact) {
          triggerEmojiReactionBurst(messageId, lastReact);
        }
      }
      const el = document.getElementById(`reactions-${messageId}`);
      if (el) el.innerHTML = renderReactions({ id: messageId, reactions });
    });

    socket.on('rate-limited', (data) => {
      showToast(data.message || 'Slow down! 🌿');
    });

    socket.on('score-update', (scores) => {
      updateScoreboardDisplay(scores);
    });

    socket.on('pictionary-start', (data) => {
      openCoDraw();
      showToast(`🎨 Pictionary: ${data.drawer} is drawing!`);
    });

    socket.on('pictionary-word', (data) => {
      showToast(`✏️ Secret Word: "${data.word}" — Start drawing!`);
    });

    socket.on('pictionary-correct', (data) => {
      confetti();
      playSound('milestone');
      showToast(`🏆 ${data.winner} guessed the word: "${data.word}"!`);
      closeCoDraw();
    });

    socket.on('history-cleared', () => {
      allMessagesCached = [];
      clearRoomHistoryInOfflineDB(myRoom);
      if (els.messages) els.messages.innerHTML = '';
      showToast('🧹 Chat history was cleared');
    });

    socket.on('password-updated', (data) => {
      showToast(data.hasPassword ? '🔒 Room password saved' : '🔓 Password removed');
    });

    socket.on('disappearing-updated', (data) => {
      const label = data.durationMs === 3600000 ? '1 Hour' : data.durationMs === 86400000 ? '24 Hours' : data.durationMs === 604800000 ? '7 Days' : 'Off';
      showToast(`⏱️ Disappearing messages set to: ${label}`);
    });

    socket.on('c4-move', (data) => {
      if (data && typeof data.col === 'number') {
        dropConnect4Token(data.col, false);
      }
    });

    socket.on('profile-updated', ({ username, profile }) => {
      if (username) {
        profiles[username] = Object.assign(profiles[username] || {}, profile);
        updateBestieHeaderState();
        refreshMessagesLayout();
      }
    });

    socket.on('calendar-update', (cal) => {
      sharedCalendar = cal || [];
      renderCalendarList(sharedCalendar);
    });
  }

  export function rejectPendingMessage(clientMsgId, reason) {
    const pendingWrap = document.querySelector(`.msg-wrap[data-id="${clientMsgId}"]`);
    if (pendingWrap) {
      pendingWrap.classList.add('msg-failed');
      const statusText = pendingWrap.querySelector('.msg-status-text');
      if (statusText) statusText.textContent = reason || 'Failed to send';
      setTimeout(() => pendingWrap.remove(), 3000);
    }
    outboxQueue = outboxQueue.filter(item => item.clientMsgId !== clientMsgId);
    saveOutboxQueue();
  }