package com.murmur.android.keyboard

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.*
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.core.content.ContextCompat
import com.murmur.android.MainActivity
import com.murmur.android.MurmurApp
import com.murmur.android.asr.PcmRecorder
import com.murmur.android.asr.Transcriber
import com.murmur.android.text.TextPipeline
import kotlinx.coroutines.*

class MurmurKeyboardService:InputMethodService(){
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main);private val recorder=PcmRecorder();private lateinit var status:TextView;private lateinit var meter:ProgressBar;private lateinit var mic:Button;private val handler=Handler(Looper.getMainLooper());private var downAt=0L;private var handsFree=false;private var startedAt=0L
 override fun onCreate(){super.onCreate();scope.launch(Dispatchers.Default){runCatching{Transcriber.load(this@MurmurKeyboardService)}}}
 override fun onCreateInputView():View{val dark=(resources.configuration.uiMode and 0x30)==0x20;val bg=if(dark)Color.rgb(28,30,27) else Color.rgb(245,244,240);val fg=if(dark)Color.rgb(238,238,232) else Color.rgb(32,35,31);return LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(10),dp(8),dp(10),dp(10));setBackgroundColor(bg)
   status=TextView(context).apply{text="Hold to dictate · tap for hands-free";setTextColor(fg);textSize=14f;gravity=Gravity.CENTER};addView(status,lp(-1,dp(28)))
   meter=ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal).apply{max=100;progress=0};addView(meter,lp(-1,dp(8)))
   mic=Button(context).apply{text="●  Hold to speak";textSize=20f;isAllCaps=false;setOnTouchListener{_,e->handleMic(e);true}};addView(mic,lp(-1,dp(70)))
   addView(keyRow(fg),lp(-1,dp(55)))
 }}
 private fun keyRow(fg:Int)=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;addView(key("🌐"){if(!switchToNextInputMethod(false))(getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()});addView(key(","){commit(",")});addView(key("space",2f){commit(" ")});addView(key("."){commit(".")});addView(key("?"){commit("?")});addView(backspaceKey());addView(key("↵"){enter()})}
 private fun key(label:String,weight:Float=1f,action:()->Unit)=Button(this).apply{text=label;textSize=if(label=="space")14f else 18f;isAllCaps=false;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(0,-1,weight).apply{setMargins(dp(2),0,dp(2),0)}}
 private fun backspaceKey()=Button(this).apply{text="⌫";textSize=19f;var repeat:Runnable?=null;setOnTouchListener{_,e->when(e.action){MotionEvent.ACTION_DOWN->{currentInputConnection.deleteSurroundingText(1,0);repeat=object:Runnable{override fun run(){currentInputConnection.deleteSurroundingText(1,0);handler.postDelayed(this,55)}};handler.postDelayed(repeat!!,400)};MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL->repeat?.let{handler.removeCallbacks(it)}};true};layoutParams=LinearLayout.LayoutParams(0,-1,1f).apply{setMargins(dp(2),0,dp(2),0)}}
 private fun handleMic(e:MotionEvent){when(e.action){MotionEvent.ACTION_DOWN->{downAt=SystemClock.elapsedRealtime();if(handsFree){stopRecording();handsFree=false}else startRecording()};MotionEvent.ACTION_UP->{if(!recorder.isRunning())return;if(SystemClock.elapsedRealtime()-downAt<300){handsFree=true;status.text="Listening · tap to finish";mic.text="■  Finish"}else stopRecording()};MotionEvent.ACTION_CANCEL->if(!handsFree)stopRecording()}}
 private fun startRecording(){if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){status.text="Microphone permission required";mic.text="Open Murmur to grant access";mic.setOnClickListener{startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))};return};startedAt=SystemClock.elapsedRealtime();recorder.start();status.text="Listening";mic.text="●  Release to insert";if(getSharedPreferences("settings",MODE_PRIVATE).getBoolean("haptics",true))mic.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);updateLevel()}
 private fun updateLevel(){if(recorder.isRunning()){meter.progress=(recorder.level*100).toInt().coerceIn(2,100);handler.postDelayed(::updateLevel,50)}else meter.progress=0}
 private fun stopRecording(){val pcm=recorder.stop();handler.removeCallbacks(::updateLevel);if(pcm.size<3200){reset();return};status.text="Transcribing…";mic.isEnabled=false;scope.launch{try{val raw=withContext(Dispatchers.Default){Transcriber.transcribe(this@MurmurKeyboardService,Transcriber.pcm16(pcm))};val app=application as MurmurApp;val result=TextPipeline.format(raw,app.store.rules("dictionary").map{it.second},app.store.rules("snippets").map{it.second});if(result.text.isNotBlank()){val before=currentInputConnection.getTextBeforeCursor(1,0)?.toString().orEmpty();val prefix=if(before.isNotEmpty()&&!before.last().isWhitespace()&&!before.last().let{it in "([{\n"})" " else "";currentInputConnection.commitText(prefix+result.text,1);if(result.pressEnter)enter();app.store.addDictation(result.text,SystemClock.elapsedRealtime()-startedAt)}}catch(e:Exception){status.text="Transcription failed: ${e.message?.take(50)}";delay(1800)}finally{reset()}}}
 private fun reset(){handsFree=false;meter.progress=0;status.text="Hold to dictate · tap for hands-free";mic.text="●  Hold to speak";mic.isEnabled=true}
 private fun commit(text:String)=currentInputConnection.commitText(text,1)
 private fun enter(){val action=currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION)?:EditorInfo.IME_ACTION_NONE;if(action!=EditorInfo.IME_ACTION_NONE&&action!=EditorInfo.IME_ACTION_UNSPECIFIED)currentInputConnection.performEditorAction(action) else currentInputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_ENTER)).also{currentInputConnection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_ENTER))}}
 private fun lp(w:Int,h:Int)=LinearLayout.LayoutParams(w,h);private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
 override fun onDestroy(){scope.cancel();if(recorder.isRunning())recorder.stop();super.onDestroy()}
}
