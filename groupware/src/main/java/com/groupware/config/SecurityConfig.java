package com.groupware.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

// @EnableWebSecurity: "기본 Security 설정 대신 이 클래스의 설정을 쓰겠다"고
// Spring Boot에게 알리는 표시. 이게 없으면 Boot의 기본 로그인 화면이 계속 뜬다.
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // 비밀번호 해시/비교 담당. 이 메서드를 빈으로 등록해두기만 하면,
    // CustomUserDetailsService가 반환한 유저의 getPassword()(해시값)와
    // 로그인 폼에 입력된 비밀번호를 Security가 자동으로 이 인코더로 비교해준다.
    // 우리가 직접 비교 코드를 짤 필요 없음. (회원가입/초기 데이터 넣을 때도
    // 반드시 이 인코더로 해시해서 EMPLOYEE_PWD에 저장해야 나중에 값이 맞음)
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // 실제 "어떤 URL은 로그인 필요한지", "로그인 성공/실패하면 어디로 갈지" 등을
    // 정의하는 필터 체인. 이 빈을 등록하면 Boot는 기본 필터 체인 대신 이걸 사용한다.
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // URL별 접근 권한 규칙. 위에서부터 순서대로 매칭됨.
            .authorizeHttpRequests(auth -> auth
                // 로그인 페이지 자체와 정적 리소스(css/js)는 로그인 안 해도 접근 가능해야
                // 로그인 화면 자체를 못 보는 상황을 막을 수 있음
                .requestMatchers("/login", "/css/**", "/js/**", "/images/**").permitAll()
                // /admin/** 은 로그인만으로는 부족하고 ADMIN 권한까지 있어야 함.
                // hasRole("ADMIN")은 내부적으로 "ROLE_ADMIN" 권한을 찾는데,
                // CustomUserDetails.getAuthorities()가 "ROLE_" + EMPLOYEE_ROLE 을
                // 반환하므로 EMPLOYEE_ROLE='ADMIN'인 계정만 통과한다.
                // 일반 직원이 URL을 직접 쳐서 들어오면 403(접근 거부)으로 막힘.
                .requestMatchers("/admin/**").hasRole("ADMIN")
                // 나머지 모든 요청은 로그인 필수 -> 여기 걸리면 자동으로 /login 으로 리다이렉트
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login")            // 커스텀 로그인 화면 경로 (컨트롤러가 GET /login 담당)
                .loginProcessingUrl("/login")   // 로그인 폼이 제출되는(POST) 경로 -> Security가 자동 처리
                // login.html의 <input name="employeeNo">와 이름을 반드시 맞춰야 함.
                // 메서드명은 Security API가 정한 usernameParameter라서 못 바꾸지만,
                // 안에 들어가는 문자열(실제 폼 필드명)은 우리 프로젝트 값(사번)에 맞게 자유롭게 지정
                .usernameParameter("employeeNo")
                .passwordParameter("password")  // login.html의 <input name="password">와 이름 맞춰야 함
                .defaultSuccessUrl("/main", true) // 로그인 성공 시 이동할 곳
                .failureUrl("/login?error=true")  // 실패 시 이동할 곳 (login.html에서 이 파라미터로 에러 표시)
            )
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login")
            )
            // CSRF: 폼 위조 공격 방어 기능인데, 켜두면 모든 <form>에 토큰을 넣어야 해서
            // 학습 초반엔 막힐 수 있음 -> 지금은 꺼두고, 나중에 폼들이 안정되면 다시 켜는 걸 권장
            .csrf(AbstractHttpConfigurer::disable);

        return http.build();
    }

}