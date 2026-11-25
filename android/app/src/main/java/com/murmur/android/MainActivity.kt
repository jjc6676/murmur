package com.murmur.android

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.murmur.android.data.Dictation
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

private val Cream=Color(0xFFF5F4F0); private val Ink=Color(0xFF20231F); private val Green=Color(0xFF2F604A)
class MainActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent{MurmurUi()}}
 @Composable private fun MurmurUi(){val prefs=getSharedPreferences("settings",MODE_PRIVATE);var dark by remember{mutableStateOf(prefs.getBoolean("dark",false))};val scheme=if(dark) darkColorScheme(primary=Color(0xFF96C9AF),background=Color(0xFF171916),surface=Color(0xFF242621)) else lightColorScheme(primary=Green,background=Cream,surface=Color.White,onBackground=Ink);MaterialTheme(scheme){Surface(Modifier.fillMaxSize()){if(!prefs.getBoolean("onboarded",false))Onboarding{prefs.edit().putBoolean("onboarded",true).apply()}else AppShell(dark){dark=it;prefs.edit().putBoolean("dark",it).apply()}}}}
 @Composable private fun Onboarding(done:()->Unit){var page by remember{mutableIntStateOf(0)};val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){};Column(Modifier.fillMaxSize().padding(28.dp),verticalArrangement=Arrangement.SpaceBetween){Column{Text("Murmur",fontFamily=FontFamily.Serif,fontSize=42.sp,fontWeight=FontWeight.SemiBold);Spacer(Modifier.height(24.dp));Text(when(page){0->"Your words, without the cloud.";1->"Let Murmur hear you";2->"Enable Murmur Keyboard";else->"Try it here"},fontFamily=FontFamily.Serif,fontSize=30.sp);Spacer(Modifier.height(12.dp));Text(when(page){0->"Private, fast voice dictation powered entirely on your phone.";1->"Microphone access is used only while you dictate. Audio never leaves this device.";2->"Android requires you to enable and select a new keyboard yourself.";else->"Tap the text box, choose Murmur, then hold the microphone."},fontSize=17.sp);if(page==3){Spacer(Modifier.height(24.dp));OutlinedTextField("",{},Modifier.fillMaxWidth(),placeholder={Text("Dictate something…")})}};Column(Modifier.fillMaxWidth()){when(page){1->Button({permission.launch(Manifest.permission.RECORD_AUDIO)},Modifier.fillMaxWidth()){Text("Grant microphone access")};2->{Button({startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))},Modifier.fillMaxWidth()){Text("Enable Murmur Keyboard")};OutlinedButton({(getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()},Modifier.fillMaxWidth()){Text("Choose keyboard")}}};Button({if(page<3)page++ else done()},Modifier.fillMaxWidth()){Text(if(page==3)"Start using Murmur" else "Continue")};TextButton(done,Modifier.align(Alignment.CenterHorizontally)){Text("Finish later")}}}
 }
 @Composable private fun AppShell(dark:Boolean,onDark:(Boolean)->Unit){var tab by remember{mutableIntStateOf(0)};Scaffold(bottomBar={NavigationBar{listOf("Home","Dictionary","Snippets","Settings").forEachIndexed{i,s->NavigationBarItem(tab==i,{tab=i},{Text(listOf("⌂","Aa","↗","⚙")[i])},label={Text(s)})}}}){pad->Box(Modifier.padding(pad)){when(tab){0->Home();1->Rules("dictionary","Dictionary","Teach Murmur names and terms it should recognize.");2->Rules("snippets","Snippets","Expand a short spoken trigger into longer text.");else->SettingsPage(dark,onDark)}}}}
 @Composable private fun Title(text:String,sub:String?=null){Column(Modifier.padding(20.dp,20.dp,20.dp,12.dp)){Text(text,fontFamily=FontFamily.Serif,fontSize=34.sp,fontWeight=FontWeight.SemiBold);if(sub!=null)Text(sub,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
 @Composable private fun Home(){val store=(application as MurmurApp).store;var query by remember{mutableStateOf("")};var revision by remember{mutableIntStateOf(0)};val rows=remember(query,revision){store.dictations(query)};val words=rows.sumOf{it.words};val minutes=rows.sumOf{it.durationMs}/60000.0;LazyColumn(Modifier.fillMaxSize()){item{Title("Good ${if(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)<12)"morning" else "day"}","Everything you say stays on this phone.");Row(Modifier.padding(horizontal=20.dp).fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){Metric("$words","total words",Modifier.weight(1f));Metric(if(minutes>0)"${(words/minutes).toInt()}" else "—","average WPM",Modifier.weight(1f));Metric(streak(rows).toString(),"day streak",Modifier.weight(1f))};OutlinedTextField(query,{query=it},Modifier.padding(20.dp,18.dp).fillMaxWidth(),singleLine=true,label={Text("Search dictations")})};if(rows.isEmpty())item{Card(Modifier.padding(20.dp).fillMaxWidth()){Column(Modifier.padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally){Text("Your dictations will appear here",fontWeight=FontWeight.SemiBold);Text("Enable Murmur Keyboard and hold the microphone to begin.")}}}else items(rows,key={it.id}){DictationCard(it){store.deleteDictation(it.id);revision++}}}
 }
 @Composable private fun Metric(value:String,label:String,modifier:Modifier){Card(modifier){Column(Modifier.padding(14.dp)){Text(value,fontFamily=FontFamily.Serif,fontSize=26.sp);Text(label,fontSize=12.sp)}}}
 @Composable private fun DictationCard(row:Dictation,onDelete:()->Unit){Card(Modifier.padding(horizontal=20.dp,vertical=5.dp).fillMaxWidth()){Column(Modifier.padding(16.dp)){Text(row.text);Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM,DateFormat.SHORT).format(Date(row.createdAt)),fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant);Row{TextButton({(getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Murmur dictation",row.text))}){Text("Copy")};TextButton({startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply{type="text/plain";putExtra(Intent.EXTRA_TEXT,row.text)},"Share dictation"))}){Text("Share")};TextButton(onDelete){Text("Delete")}}}}}
 private fun streak(rows:List<Dictation>):Int{val day=86400000L;val days=rows.map{it.createdAt/day}.toSet();var d=System.currentTimeMillis()/day;var n=0;while(d in days){n++;d--};return n}
 @Composable private fun Rules(table:String,title:String,subtitle:String){val store=(application as MurmurApp).store;var revision by remember{mutableIntStateOf(0)};val rows=remember(revision){store.rules(table)};var phrase by remember{mutableStateOf("")};var replacement by remember{mutableStateOf("")};LazyColumn{item{Title(title,subtitle);Card(Modifier.padding(20.dp).fillMaxWidth()){Column(Modifier.padding(16.dp)){OutlinedTextField(phrase,{phrase=it},Modifier.fillMaxWidth(),label={Text(if(table=="dictionary")"Word or phrase" else "Spoken trigger")});OutlinedTextField(replacement,{replacement=it},Modifier.fillMaxWidth(),label={Text(if(table=="dictionary")"Replacement (optional)" else "Expansion")});Button({if(phrase.isNotBlank()){store.saveRule(table,null,phrase,replacement.ifBlank{phrase});phrase="";replacement="";revision++}},Modifier.align(Alignment.End).padding(top=8.dp)){Text("Add")}}}};items(rows,key={it.first}){(id,r)->ListItem(headlineContent={Text(r.phrase)},supportingContent={if(r.replacement!=r.phrase)Text(r.replacement)},trailingContent={TextButton({store.deleteRule(table,id);revision++}){Text("Delete")}});HorizontalDivider()}}
 }
 @Composable private fun SettingsPage(dark:Boolean,onDark:(Boolean)->Unit){val app=application as MurmurApp;val prefs=getSharedPreferences("settings",MODE_PRIVATE);var model by remember{mutableStateOf(app.models.currentName())};var progress by remember{mutableIntStateOf(-1)};var threads by remember{mutableFloatStateOf(prefs.getInt("threads",minOf(4,Runtime.getRuntime().availableProcessors())).toFloat())};var haptics by remember{mutableStateOf(prefs.getBoolean("haptics",true))};val scope=rememberCoroutineScope();LazyColumn{item{Title("Settings","Murmur is private by design.");Setting("Speech model",if(model=="base")"Base English · bundled" else "Tiny English · faster"){Column{Row{FilterChip(model=="base",{app.models.select("base");model="base"},{Text("Base")});Spacer(Modifier.width(8.dp));FilterChip(model=="tiny",{if(app.models.tinyFile.exists()){app.models.select("tiny");model="tiny"}else scope.launch{progress=0;app.models.downloadTiny{progress=it};model="tiny"}},{Text(if(app.models.tinyFile.exists())"Tiny" else "Download Tiny")})};if(progress in 0..99)LinearProgressIndicator({progress/100f},Modifier.fillMaxWidth())}};Setting("Transcription threads",threads.toInt().toString()){Slider(threads,{threads=it;prefs.edit().putInt("threads",it.toInt()).apply()},valueRange=1f..minOf(4,Runtime.getRuntime().availableProcessors()).toFloat(),steps=maxOf(0,minOf(4,Runtime.getRuntime().availableProcessors())-2))};Setting("Haptic feedback",if(haptics)"On" else "Off"){Switch(haptics,{haptics=it;prefs.edit().putBoolean("haptics",it).apply()})};Setting("Dark theme",if(dark)"On" else "Off"){Switch(dark,onDark)};Setting("Keyboard","Open Android input settings"){Button({startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))}){Text("Manage keyboards")}};Setting("About","Murmur 0.1.0 · Offline voice dictation"){} }} }
 @Composable private fun Setting(title:String, summary:String, content: @Composable () -> Unit){Card(Modifier.padding(horizontal=20.dp,vertical=6.dp).fillMaxWidth(),shape=RoundedCornerShape(16.dp)){Column(Modifier.padding(16.dp)){Text(title,fontWeight=FontWeight.SemiBold);Text(summary,fontSize=13.sp,color=MaterialTheme.colorScheme.onSurfaceVariant);Spacer(Modifier.height(8.dp));content()}}}
}
