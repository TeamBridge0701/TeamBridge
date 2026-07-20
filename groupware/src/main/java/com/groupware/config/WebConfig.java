package com.groupware.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	@Value("${groupware.profileImg.upload-dir}")
	private String profileImgUploadDir;

	// /uploads/profileImg/**로 오는 요청은 Controller 대신 정적 파일로 바로 서빙.
	// "file:" 접두어(클래스패스 아닌 실제 디스크 경로라는 뜻)와 경로 끝 "/" 둘 다 빠뜨리면 안 됨
	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/uploads/profileImg/**")
		.addResourceLocations("file:" + profileImgUploadDir + "/");
	}
}
