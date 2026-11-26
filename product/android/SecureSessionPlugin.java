package com.rainy256.qidongapp;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="SecureSession")
public class SecureSessionPlugin extends Plugin {
 private static final String ALIAS="qidongapp.session.v1";
 private static final String PREF="qidong_secure_session";
 private SharedPreferences prefs(){return getContext().getSharedPreferences(PREF,0);}
 private SecretKey key() throws Exception {
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(ks.containsAlias(ALIAS))return (SecretKey)ks.getKey(ALIAS,null);
  KeyGenerator kg=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
  kg.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
  return kg.generateKey();
 }
 @PluginMethod public void get(PluginCall call){
  try{String ciphertext=prefs().getString("cipher",null),iv=prefs().getString("iv",null);JSObject out=new JSObject();
   if(ciphertext!=null&&iv!=null){Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));out.put("token",new String(c.doFinal(Base64.decode(ciphertext,Base64.NO_WRAP)),StandardCharsets.UTF_8));}
   call.resolve(out);
  }catch(Exception e){call.reject("Secure session unavailable");}
 }
 @PluginMethod public void set(PluginCall call){
  try{String token=call.getString("token");if(token==null||!token.matches("[a-f0-9]{64}")){call.reject("Invalid session");return;}
   Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());
   String encrypted=Base64.encodeToString(c.doFinal(token.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
   if(!prefs().edit().putString("cipher",encrypted).putString("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).commit())throw new Exception();
   call.resolve();
  }catch(Exception e){call.reject("Secure session write failed");}
 }
 @PluginMethod public void clear(PluginCall call){if(prefs().edit().clear().commit())call.resolve();else call.reject("Secure session clear failed");}
}
